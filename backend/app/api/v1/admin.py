"""The admin panel's API.

Every route is behind `require_admin`, and every change appends an
AdminAction. That table exists precisely so admin activity is auditable -- an
admin surface that skipped it would be worse than none, because the absence of
a record would look like the absence of an action. Viewing an ID document is
logged too: who looked at whose government ID is exactly the question that
gets asked afterwards.
"""

import mimetypes
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, or_, select, update

from app.api.deps import DbSession, require_admin
from app.api.v1.documents import BADGE_FIELD
from app.core.config import settings
from app.models.billing import Plan, Subscription
from app.models.enums import (
    ACTIVE_SUBSCRIPTION_STATUSES,
    CutoutStatus,
    DocumentKind,
    DocumentStatus,
    SubscriptionStatus,
    UserRole,
    UserStatus,
    VerificationStatus,
)
from app.models.geo import District
from app.models.marketplace import Document, HelperProfile, HireRequest
from app.models.messaging import Message
from app.models.taxonomy import HelperSkill, Service, Skill
from app.models.user import AdminAction, RefreshToken, User
from app.providers.registry import get_imaging, get_storage
from app.services import subscription_service
from app.services.events import publish
from app.services.notify import notify

AdminUser = Annotated[User, Depends(require_admin)]
router = APIRouter(prefix="/admin", tags=["admin"])

#: Icons an admin may give a service. Mirrors SERVICE_ICONS in
#: web/src/lib/serviceIcons.ts -- the tab row can only draw what that map holds,
#: so both lists change together or the picker offers an icon that renders as
#: the fallback.
SERVICE_ICONS: tuple[str, ...] = (
    "sparkles", "broom-sparkles", "mop-sparkles", "broom", "spray-can",
    "washing-machine", "shirt", "chef-hat", "cooking-pot", "utensils", "soup",
    "stethoscope", "heart-pulse", "pill", "syringe", "hospital", "accessibility",
    "heart-handshake", "hand-heart", "baby", "users", "bed", "armchair",
    "car-front", "bike", "truck", "flower-2", "sprout", "leaf", "trees",
    "dog", "cat", "paw-print", "wrench", "hammer", "brush",
    "graduation-cap", "book-open", "shopping-basket", "house",
)

#: Slugs live in shared links (`/?service=home_nurse`), so they are validated
#: hard on the way in and never changed afterwards.
SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")

DOCUMENT_LABEL = {
    DocumentKind.ID_PROOF: "ID",
    DocumentKind.ADDRESS_PROOF: "address proof",
    DocumentKind.POLICE_VERIFICATION: "police verification",
    DocumentKind.PHOTO: "photo",
}


def _audit(
    db, admin: User, action: str, target_type: str, target_id: uuid.UUID | None, note: str = ""
) -> None:
    db.add(
        AdminAction(
            admin_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            note=note[:2000],
        )
    )


def _live(now: datetime):
    return (
        Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
        Subscription.current_end > now,
    )


async def _subscribed_ids(db, user_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not user_ids:
        return set()
    rows = await db.execute(
        select(Subscription.user_id).where(
            Subscription.user_id.in_(user_ids), *_live(datetime.now(UTC))
        )
    )
    return set(rows.scalars().all())


# =========================================================================== #
# dashboard
# =========================================================================== #
class StatsOut(BaseModel):
    users_by_role: dict[str, int]
    signups_7d: int
    helpers_listed: int
    helpers_hidden: int
    paying_members: int
    comped_members: int
    #: Paying members x the flat fee. An estimate of this month, not a ledger.
    monthly_revenue_paise: int
    hires_by_status: dict[str, int]
    documents_pending: int
    cutouts_failed: int
    messages_7d: int


@router.get("/stats", response_model=StatsOut)
async def stats(admin: AdminUser, db: DbSession) -> StatsOut:
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)

    async def count(stmt) -> int:
        return (await db.execute(stmt)).scalar_one()

    by_role = (
        await db.execute(
            select(User.role, func.count())
            .where(User.status != UserStatus.DELETED)
            .group_by(User.role)
        )
    ).all()
    hires = (
        await db.execute(select(HireRequest.status, func.count()).group_by(HireRequest.status))
    ).all()

    live_members = select(Subscription.user_id).where(*_live(now))
    paying = await count(
        select(func.count(func.distinct(Subscription.user_id))).where(
            *_live(now), Subscription.razorpay_subscription_id.is_not(None)
        )
    )
    comped = await count(
        select(func.count(func.distinct(Subscription.user_id))).where(
            *_live(now),
            Subscription.razorpay_subscription_id.is_(None),
            # Someone both comped and paying counts once, as paying.
            Subscription.user_id.not_in(
                select(Subscription.user_id).where(
                    *_live(now), Subscription.razorpay_subscription_id.is_not(None)
                )
            ),
        )
    )
    del live_members

    return StatsOut(
        users_by_role={role.value: n for role, n in by_role},
        signups_7d=await count(
            select(func.count()).select_from(User).where(User.created_at >= week_ago)
        ),
        helpers_listed=await count(
            select(func.count())
            .select_from(HelperProfile)
            .where(HelperProfile.is_listed.is_(True), HelperProfile.admin_hidden.is_(False))
        ),
        helpers_hidden=await count(
            select(func.count())
            .select_from(HelperProfile)
            .where(HelperProfile.admin_hidden.is_(True))
        ),
        paying_members=paying,
        comped_members=comped,
        monthly_revenue_paise=paying * settings.SUBSCRIPTION_AMOUNT_PAISE,
        hires_by_status={s.value: n for s, n in hires},
        documents_pending=await count(
            select(func.count())
            .select_from(Document)
            .where(Document.status == DocumentStatus.PENDING)
        ),
        cutouts_failed=await count(
            select(func.count())
            .select_from(HelperProfile)
            .where(
                HelperProfile.cutout_status == CutoutStatus.FAILED,
                HelperProfile.photo_key.is_not(None),
            )
        ),
        messages_7d=await count(
            select(func.count()).select_from(Message).where(Message.created_at >= week_ago)
        ),
    )


# =========================================================================== #
# verification queue
# =========================================================================== #
class DocumentRow(BaseModel):
    id: uuid.UUID
    kind: DocumentKind
    status: DocumentStatus
    review_note: str
    created_at: datetime
    user_id: uuid.UUID
    user_name: str
    user_phone: str | None
    helper_profile_id: uuid.UUID | None
    content_type: str


class DocumentDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def _reason_for_rejection(self):
        # A rejection without a reason leaves the helper guessing what to fix,
        # and they will usually just upload the same thing again.
        if self.decision == "reject" and not self.note.strip():
            raise ValueError("Say why, so the helper knows what to upload instead")
        return self


async def _document_row(db, doc: Document, user: User) -> DocumentRow:
    profile_id = (
        await db.execute(select(HelperProfile.id).where(HelperProfile.user_id == user.id))
    ).scalar_one_or_none()
    return DocumentRow(
        id=doc.id,
        kind=doc.kind,
        status=doc.status,
        review_note=doc.review_note,
        created_at=doc.created_at,
        user_id=user.id,
        user_name=user.full_name or "Unnamed",
        user_phone=user.phone,
        helper_profile_id=profile_id,
        content_type=mimetypes.guess_type(doc.storage_key)[0] or "application/octet-stream",
    )


@router.get("/documents", response_model=list[DocumentRow])
async def documents(
    admin: AdminUser,
    db: DbSession,
    status_filter: DocumentStatus | None = Query(default=DocumentStatus.PENDING, alias="status"),
) -> list[DocumentRow]:
    stmt = select(Document, User).join(User, Document.user_id == User.id)
    if status_filter is not None:
        stmt = stmt.where(Document.status == status_filter)
    # Oldest first: it is a queue, and the person who has waited longest goes next.
    rows = (await db.execute(stmt.order_by(Document.created_at.asc()).limit(200))).all()
    return [await _document_row(db, doc, user) for doc, user in rows]


@router.get("/documents/{doc_id}/file")
async def document_file(doc_id: uuid.UUID, admin: AdminUser, db: DbSession) -> Response:
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    data = await get_storage().read(key=doc.storage_key)
    _audit(db, admin, "document.view", "document", doc.id)
    return Response(
        content=data,
        media_type=mimetypes.guess_type(doc.storage_key)[0] or "application/octet-stream",
        # Never cached: a shared machine's disk cache is not where an ID belongs.
        headers={"Cache-Control": "no-store", "Content-Disposition": "inline"},
    )


@router.patch("/documents/{doc_id}", response_model=DocumentRow)
async def decide_document(
    doc_id: uuid.UUID, payload: DocumentDecision, admin: AdminUser, db: DbSession
) -> DocumentRow:
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    if doc.status is not DocumentStatus.PENDING:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This document was already {doc.status.value}."
        )

    approved = payload.decision == "approve"
    doc.status = DocumentStatus.APPROVED if approved else DocumentStatus.REJECTED
    doc.reviewed_by = admin.id
    doc.review_note = payload.note.strip()

    field = BADGE_FIELD.get(doc.kind)
    if field:
        profile = (
            await db.execute(select(HelperProfile).where(HelperProfile.user_id == doc.user_id))
        ).scalar_one_or_none()
        if profile is not None:
            if approved:
                setattr(profile, field, VerificationStatus.VERIFIED)
            elif getattr(profile, field) is not VerificationStatus.VERIFIED:
                # Rejecting a second upload never strips a badge already earned.
                setattr(profile, field, VerificationStatus.REJECTED)

    label = DOCUMENT_LABEL.get(doc.kind, "document")
    await notify(
        db,
        user_id=doc.user_id,
        kind="verification",
        title=(
            f"Your {label} is verified" if approved else f"We could not verify your {label}"
        ),
        body=(
            "The Verified badge now shows on your card."
            if approved and field
            else payload.note.strip() or "Thank you -- it has been reviewed."
        ),
        link="/account",
    )
    _audit(db, admin, f"document.{payload.decision}", "document", doc.id, payload.note)
    await db.flush()
    return await _document_row(db, doc, await db.get(User, doc.user_id))


# =========================================================================== #
# users
# =========================================================================== #
class UserRow(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str | None
    email: str | None
    role: UserRole
    status: UserStatus
    created_at: datetime
    subscribed: bool
    helper_profile_id: uuid.UUID | None


class UsersPage(BaseModel):
    items: list[UserRow]
    total: int


class UserStatusPatch(BaseModel):
    status: Literal["active", "suspended"]
    note: str = Field(default="", max_length=1000)


async def _user_rows(db, users: list[User]) -> list[UserRow]:
    ids = [u.id for u in users]
    subscribed = await _subscribed_ids(db, ids)
    profiles = dict(
        (
            await db.execute(
                select(HelperProfile.user_id, HelperProfile.id).where(
                    HelperProfile.user_id.in_(ids)
                )
            )
        ).all()
    ) if ids else {}
    return [
        UserRow(
            id=u.id,
            full_name=u.full_name,
            phone=u.phone,
            email=u.email,
            role=u.role,
            status=u.status,
            created_at=u.created_at,
            subscribed=u.id in subscribed,
            helper_profile_id=profiles.get(u.id),
        )
        for u in users
    ]


@router.get("/users", response_model=UsersPage)
async def users(
    admin: AdminUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=80),
    role: UserRole | None = None,
    status_filter: UserStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> UsersPage:
    stmt = select(User)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(User.full_name.ilike(pattern), User.phone.ilike(pattern), User.email.ilike(pattern))
        )
    if role is not None:
        stmt = stmt.where(User.role == role)
    if status_filter is not None:
        stmt = stmt.where(User.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset))
    ).scalars().all()
    return UsersPage(items=await _user_rows(db, list(rows)), total=total)


@router.patch("/users/{user_id}", response_model=UserRow)
async def set_user_status(
    user_id: uuid.UUID, payload: UserStatusPatch, admin: AdminUser, db: DbSession
) -> UserRow:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot change your own account here.")
    if target.role is UserRole.ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admins cannot suspend other admins from the panel."
        )
    if target.status is UserStatus.DELETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account was closed by its owner.")

    now = datetime.now(UTC)
    if payload.status == "suspended":
        target.status = UserStatus.SUSPENDED
        # Every session ends now, not whenever an access token happens to expire.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == target.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        if target.role is UserRole.HELPER:
            await db.execute(
                update(HelperProfile)
                .where(HelperProfile.user_id == target.id)
                .values(is_listed=False)
            )
        # Open sockets are closed too -- a suspended account must stop hearing
        # messages immediately. See app/realtime/hub.py.
        await publish(db, to=[target.id], type="session_revoked", data={})
    else:
        target.status = UserStatus.ACTIVE
        await subscription_service.sync_listing_flag(db, target.id)
        await notify(
            db,
            user_id=target.id,
            kind="account",
            title="Your account has been restored",
            body=payload.note.strip() or "Welcome back.",
            link="/account",
        )

    _audit(db, admin, f"user.{payload.status}", "user", target.id, payload.note)
    await db.flush()
    return (await _user_rows(db, [target]))[0]


# =========================================================================== #
# listings moderation and the cutout queue
# =========================================================================== #
class HelperRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    phone: str | None
    service_name: str | None
    district_name: str | None
    is_listed: bool
    admin_hidden: bool
    id_verification_status: VerificationStatus
    police_verification_status: VerificationStatus
    cutout_status: CutoutStatus
    photo_url: str | None
    cutout_url: str | None
    rating_avg: float | None
    rating_count: int
    created_at: datetime


class HelpersPage(BaseModel):
    items: list[HelperRow]
    total: int


class HelperModeration(BaseModel):
    hidden: bool
    note: str = Field(default="", max_length=1000)


class RecutoutOut(BaseModel):
    helper: HelperRow
    ok: bool
    note: str


def _helper_row(
    profile: HelperProfile, user: User, service: Service | None, district: District | None
) -> HelperRow:
    storage = get_storage()
    return HelperRow(
        id=profile.id,
        user_id=user.id,
        full_name=user.full_name,
        phone=user.phone,
        service_name=service.name if service else None,
        district_name=district.name if district else None,
        is_listed=profile.is_listed,
        admin_hidden=profile.admin_hidden,
        id_verification_status=profile.id_verification_status,
        police_verification_status=profile.police_verification_status,
        cutout_status=profile.cutout_status,
        photo_url=storage.url_for(key=profile.photo_key) if profile.photo_key else None,
        cutout_url=(
            storage.url_for(key=profile.photo_cutout_key) if profile.photo_cutout_key else None
        ),
        rating_avg=float(profile.rating_avg) if profile.rating_avg else None,
        rating_count=profile.rating_count,
        created_at=profile.created_at,
    )


def _helper_query():
    return (
        select(HelperProfile, User, Service, District)
        .join(User, HelperProfile.user_id == User.id)
        .outerjoin(Service, HelperProfile.service_id == Service.id)
        .outerjoin(District, HelperProfile.district_id == District.id)
    )


async def _one_helper_row(db, profile_id: uuid.UUID) -> HelperRow:
    row = (await db.execute(_helper_query().where(HelperProfile.id == profile_id))).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")
    return _helper_row(*row)


@router.get("/helpers", response_model=HelpersPage)
async def helpers(
    admin: AdminUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=80),
    hidden: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> HelpersPage:
    stmt = _helper_query()
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.phone.ilike(pattern)))
    if hidden is not None:
        stmt = stmt.where(HelperProfile.admin_hidden.is_(hidden))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(HelperProfile.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    return HelpersPage(items=[_helper_row(*r) for r in rows], total=total)


@router.patch("/helpers/{profile_id}", response_model=HelperRow)
async def moderate_helper(
    profile_id: uuid.UUID, payload: HelperModeration, admin: AdminUser, db: DbSession
) -> HelperRow:
    profile = await db.get(HelperProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")
    if profile.admin_hidden == payload.hidden:
        return await _one_helper_row(db, profile.id)

    profile.admin_hidden = payload.hidden
    await notify(
        db,
        user_id=profile.user_id,
        kind="account",
        title=(
            "Your profile is hidden from search"
            if payload.hidden
            else "Your profile is visible again"
        ),
        body=payload.note.strip()
        or (
            "Contact Sahaya support to find out why and what to change."
            if payload.hidden
            else "Families can find you in search again."
        ),
        link="/account",
    )
    _audit(
        db, admin, "helper.hide" if payload.hidden else "helper.unhide", "helper", profile.id,
        payload.note,
    )
    await db.flush()
    return await _one_helper_row(db, profile.id)


@router.get("/cutouts", response_model=list[HelperRow])
async def cutout_queue(admin: AdminUser, db: DbSession) -> list[HelperRow]:
    """Helpers whose background removal failed -- the human-look queue that
    DECISIONS.md 009 promised. They are listed and working; only their card
    is showing the circular fallback instead of the cut-out."""
    rows = (
        await db.execute(
            _helper_query()
            .where(
                HelperProfile.cutout_status == CutoutStatus.FAILED,
                HelperProfile.photo_key.is_not(None),
            )
            .order_by(HelperProfile.updated_at.desc())
        )
    ).all()
    return [_helper_row(*r) for r in rows]


@router.post("/helpers/{profile_id}/recutout", response_model=RecutoutOut)
async def recutout(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> RecutoutOut:
    """Run background removal again on the stored original."""
    profile = await db.get(HelperProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")
    if not profile.photo_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "This helper has no photo to process.")

    storage = get_storage()
    result = await get_imaging().cutout(await storage.read(key=profile.photo_key))
    if result.ok and result.data:
        # A fresh key, so browsers do not keep showing the failed version from
        # cache. Only this helper's own old cutout is removed -- never a shared
        # demo/ image, which many profiles point at.
        old_key = profile.photo_cutout_key
        profile.photo_cutout_key = await storage.save(
            key=f"helpers/{profile.id}/cutout-{uuid.uuid4().hex[:12]}.png",
            data=result.data,
            content_type="image/png",
        )
        profile.cutout_status = CutoutStatus.DONE
        if old_key and old_key.startswith(f"helpers/{profile.id}/"):
            await storage.delete(key=old_key)
    else:
        profile.cutout_status = CutoutStatus.FAILED

    _audit(db, admin, "helper.recutout", "helper", profile.id, result.reason or "ok")
    await db.flush()
    return RecutoutOut(
        helper=await _one_helper_row(db, profile.id), ok=result.ok, note=result.reason
    )


# =========================================================================== #
# subscriptions
# =========================================================================== #
class SubscriptionRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_phone: str | None
    role: UserRole
    plan_code: str
    status: SubscriptionStatus
    current_start: datetime | None
    current_end: datetime | None
    cancelled_at: datetime | None
    #: Granted from this panel rather than paid through Razorpay.
    is_comp: bool
    #: Grants access right now.
    is_live: bool


class SubscriptionsPage(BaseModel):
    items: list[SubscriptionRow]
    total: int


class CompIn(BaseModel):
    days: int = Field(default=30, ge=1, le=366)
    note: str = Field(default="", max_length=1000)


class CancelIn(BaseModel):
    note: str = Field(default="", max_length=1000)


def _subscription_row(sub: Subscription, user: User, plan: Plan) -> SubscriptionRow:
    now = datetime.now(UTC)
    return SubscriptionRow(
        id=sub.id,
        user_id=user.id,
        user_name=user.full_name,
        user_phone=user.phone,
        role=user.role,
        plan_code=plan.code.value,
        status=sub.status,
        current_start=sub.current_start,
        current_end=sub.current_end,
        cancelled_at=sub.cancelled_at,
        is_comp=sub.razorpay_subscription_id is None,
        is_live=sub.status in ACTIVE_SUBSCRIPTION_STATUSES
        and sub.current_end is not None
        and sub.current_end > now,
    )


@router.get("/subscriptions", response_model=SubscriptionsPage)
async def subscriptions(
    admin: AdminUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=80),
    status_filter: SubscriptionStatus | None = Query(default=None, alias="status"),
    live: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> SubscriptionsPage:
    now = datetime.now(UTC)
    stmt = (
        select(Subscription, User, Plan)
        .join(User, Subscription.user_id == User.id)
        .join(Plan, Subscription.plan_id == Plan.id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.phone.ilike(pattern)))
    if status_filter is not None:
        stmt = stmt.where(Subscription.status == status_filter)
    if live is True:
        stmt = stmt.where(*_live(now))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(Subscription.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    return SubscriptionsPage(items=[_subscription_row(*r) for r in rows], total=total)


@router.post(
    "/users/{user_id}/comp",
    response_model=SubscriptionRow,
    status_code=status.HTTP_201_CREATED,
)
async def comp_membership(
    user_id: uuid.UUID, payload: CompIn, admin: AdminUser, db: DbSession
) -> SubscriptionRow:
    """Grant membership days without a payment -- support credit, a pilot, a
    helper who cannot pay this month. Recorded as a comp, never as revenue."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    try:
        code = subscription_service.plan_code_for_role(target.role)
    except subscription_service.BillingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    plan = (await db.execute(select(Plan).where(Plan.code == code))).scalar_one()

    now = datetime.now(UTC)
    sub = Subscription(
        user_id=target.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        current_start=now,
        current_end=now + timedelta(days=payload.days),
        razorpay_subscription_id=None,
    )
    db.add(sub)
    await db.flush()
    await subscription_service.sync_listing_flag(db, target.id)
    await notify(
        db,
        user_id=target.id,
        kind="billing",
        title=f"{payload.days} days of membership added",
        body="From Sahaya, on the house. Nothing to pay.",
        link="/settings",
    )
    _audit(db, admin, "subscription.comp", "user", target.id, f"{payload.days} days. {payload.note}")
    await db.refresh(sub)
    return _subscription_row(sub, target, plan)


@router.post("/subscriptions/{sub_id}/cancel", response_model=SubscriptionRow)
async def cancel_subscription(
    sub_id: uuid.UUID, payload: CancelIn, admin: AdminUser, db: DbSession
) -> SubscriptionRow:
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    if sub.status in (
        SubscriptionStatus.CANCELLED,
        SubscriptionStatus.COMPLETED,
        SubscriptionStatus.EXPIRED,
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This membership is already {sub.status.value}.")

    razorpay_id = sub.razorpay_subscription_id
    if razorpay_id and not razorpay_id.startswith("sub_demo") and settings.RAZORPAY_KEY_ID:
        # Razorpay first. Marking it cancelled here while Razorpay keeps
        # charging would be the worst possible outcome, so if Razorpay does not
        # confirm, nothing changes.
        try:
            subscription_service.get_client().subscription.cancel(razorpay_id)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Razorpay did not confirm the cancellation, so nothing was changed: {exc}",
            ) from None

    now = datetime.now(UTC)
    sub.status = SubscriptionStatus.CANCELLED
    sub.cancelled_at = now
    sub.current_end = now
    await db.flush()
    await subscription_service.sync_listing_flag(db, sub.user_id)
    await notify(
        db,
        user_id=sub.user_id,
        kind="billing",
        title="Your membership was cancelled",
        body=payload.note.strip() or "Contact Sahaya support if this is unexpected.",
        link="/settings",
    )
    _audit(db, admin, "subscription.cancel", "subscription", sub.id, payload.note)
    user = await db.get(User, sub.user_id)
    plan = await db.get(Plan, sub.plan_id)
    return _subscription_row(sub, user, plan)


# =========================================================================== #
# categories (services)
# =========================================================================== #
class ServiceRow(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    name_ml: str
    icon: str
    sort_order: int
    is_active: bool
    show_in_nav: bool
    nav_label: str
    #: Shown before archiving, so the consequence is visible before the click.
    helper_count: int
    listed_count: int


def _check_icon(value: str | None) -> str | None:
    if value is not None and value not in SERVICE_ICONS:
        raise ValueError(f"Unknown icon {value!r}. Pick one from the list.")
    return value


class ServiceCreate(BaseModel):
    slug: str
    name: str = Field(min_length=1, max_length=120)
    name_ml: str = Field(default="", max_length=120)
    icon: str
    show_in_nav: bool = False
    nav_label: str = Field(default="", max_length=40)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str) -> str:
        value = value.strip().lower()
        if not SLUG_RE.match(value):
            raise ValueError(
                "Use 2 to 40 lowercase letters, digits or underscores, starting with a letter"
            )
        return value

    _icon = field_validator("icon")(classmethod(lambda cls, v: _check_icon(v)))


class ServicePatch(BaseModel):
    # `extra="forbid"`: a client sending `slug` gets a 422, not a silent
    # no-op that looks like the rename worked.
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    name_ml: str | None = Field(default=None, max_length=120)
    icon: str | None = None
    show_in_nav: bool | None = None
    nav_label: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None

    _icon = field_validator("icon")(classmethod(lambda cls, v: _check_icon(v)))


class ReorderIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1)


async def _service_rows(db, services: list[Service]) -> list[ServiceRow]:
    totals = dict(
        (
            await db.execute(
                select(HelperProfile.service_id, func.count()).group_by(HelperProfile.service_id)
            )
        ).all()
    )
    listed = dict(
        (
            await db.execute(
                select(HelperProfile.service_id, func.count())
                .where(HelperProfile.is_listed.is_(True), HelperProfile.admin_hidden.is_(False))
                .group_by(HelperProfile.service_id)
            )
        ).all()
    )
    return [
        ServiceRow(
            id=s.id,
            slug=s.slug,
            name=s.name,
            name_ml=s.name_ml,
            icon=s.icon,
            sort_order=s.sort_order,
            is_active=s.is_active,
            show_in_nav=s.show_in_nav,
            nav_label=s.nav_label,
            helper_count=totals.get(s.id, 0),
            listed_count=listed.get(s.id, 0),
        )
        for s in services
    ]


async def _all_services(db) -> list[Service]:
    return list(
        (await db.execute(select(Service).order_by(Service.sort_order, Service.name)))
        .scalars()
        .all()
    )


@router.get("/services", response_model=list[ServiceRow])
async def list_services(admin: AdminUser, db: DbSession) -> list[ServiceRow]:
    """Every service, archived ones included -- unlike GET /taxonomy."""
    return await _service_rows(db, await _all_services(db))


@router.post("/services", response_model=ServiceRow, status_code=status.HTTP_201_CREATED)
async def create_service(payload: ServiceCreate, admin: AdminUser, db: DbSession) -> ServiceRow:
    taken = (await db.execute(select(Service.id).where(Service.slug == payload.slug))).first()
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The slug {payload.slug!r} is already used.")
    last = (await db.execute(select(func.max(Service.sort_order)))).scalar_one() or 0
    service = Service(
        slug=payload.slug,
        name=payload.name.strip(),
        name_ml=payload.name_ml.strip(),
        icon=payload.icon,
        sort_order=last + 10,
        show_in_nav=payload.show_in_nav,
        nav_label=payload.nav_label.strip(),
    )
    db.add(service)
    await db.flush()
    _audit(db, admin, "service.create", "service", service.id, service.slug)
    return (await _service_rows(db, [service]))[0]


@router.patch("/services/{service_id}", response_model=ServiceRow)
async def update_service(
    service_id: uuid.UUID, payload: ServicePatch, admin: AdminUser, db: DbSession
) -> ServiceRow:
    service = await db.get(Service, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found.")

    changes = payload.model_dump(exclude_unset=True)
    archived_toggle = "is_active" in changes and changes["is_active"] != service.is_active
    for field, value in changes.items():
        if value is None:
            continue
        setattr(service, field, value.strip() if isinstance(value, str) else value)

    if archived_toggle:
        action = "service.restore" if service.is_active else "service.archive"
    else:
        action = "service.update"
    _audit(db, admin, action, "service", service.id, ", ".join(sorted(changes)))
    await db.flush()
    return (await _service_rows(db, [service]))[0]


@router.post("/services/reorder", response_model=list[ServiceRow])
async def reorder_services(payload: ReorderIn, admin: AdminUser, db: DbSession) -> list[ServiceRow]:
    services = {s.id: s for s in await _all_services(db)}
    if len(payload.ids) != len(set(payload.ids)) or set(payload.ids) != set(services):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Send every service exactly once, in the new order."
        )
    # Gaps of ten, so a later insert between two services needs no renumbering.
    for index, service_id in enumerate(payload.ids):
        services[service_id].sort_order = (index + 1) * 10
    _audit(db, admin, "service.reorder", "service", None)
    await db.flush()
    return await _service_rows(db, await _all_services(db))


# =========================================================================== #
# skills (the card chips)
# =========================================================================== #
class SkillRow(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    name_ml: str
    sort_order: int
    is_active: bool
    #: Shown before archiving, so the consequence is visible before the click.
    helper_count: int
    listed_count: int


class SkillCreate(BaseModel):
    slug: str
    name: str = Field(min_length=1, max_length=120)
    name_ml: str = Field(default="", max_length=120)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str) -> str:
        value = value.strip().lower()
        if not SLUG_RE.match(value):
            raise ValueError(
                "Use 2 to 40 lowercase letters, digits or underscores, starting with a letter"
            )
        return value


class SkillPatch(BaseModel):
    # `extra="forbid"` for the same reason as ServicePatch: a client sending
    # `slug` gets a 422, not a silent no-op that looks like a rename.
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    name_ml: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


async def _skill_rows(db, skills: list[Skill]) -> list[SkillRow]:
    totals = dict(
        (
            await db.execute(
                select(HelperSkill.skill_id, func.count()).group_by(HelperSkill.skill_id)
            )
        ).all()
    )
    listed = dict(
        (
            await db.execute(
                select(HelperSkill.skill_id, func.count())
                .join(HelperProfile, HelperSkill.helper_profile_id == HelperProfile.id)
                .where(HelperProfile.is_listed.is_(True), HelperProfile.admin_hidden.is_(False))
                .group_by(HelperSkill.skill_id)
            )
        ).all()
    )
    return [
        SkillRow(
            id=s.id,
            slug=s.slug,
            name=s.name,
            name_ml=s.name_ml,
            sort_order=s.sort_order,
            is_active=s.is_active,
            helper_count=totals.get(s.id, 0),
            listed_count=listed.get(s.id, 0),
        )
        for s in skills
    ]


async def _all_skills(db) -> list[Skill]:
    return list(
        (await db.execute(select(Skill).order_by(Skill.sort_order, Skill.name)))
        .scalars()
        .all()
    )


@router.get("/skills", response_model=list[SkillRow])
async def list_skills(admin: AdminUser, db: DbSession) -> list[SkillRow]:
    """Every skill, archived ones included -- unlike GET /taxonomy."""
    return await _skill_rows(db, await _all_skills(db))


@router.post("/skills", response_model=SkillRow, status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillCreate, admin: AdminUser, db: DbSession) -> SkillRow:
    taken = (await db.execute(select(Skill.id).where(Skill.slug == payload.slug))).first()
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The slug {payload.slug!r} is already used.")
    last = (await db.execute(select(func.max(Skill.sort_order)))).scalar_one() or 0
    skill = Skill(
        slug=payload.slug,
        name=payload.name.strip(),
        name_ml=payload.name_ml.strip(),
        sort_order=last + 10,
    )
    db.add(skill)
    await db.flush()
    _audit(db, admin, "skill.create", "skill", skill.id, skill.slug)
    return (await _skill_rows(db, [skill]))[0]


@router.patch("/skills/{skill_id}", response_model=SkillRow)
async def update_skill(
    skill_id: uuid.UUID, payload: SkillPatch, admin: AdminUser, db: DbSession
) -> SkillRow:
    skill = await db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill not found.")

    changes = payload.model_dump(exclude_unset=True)
    archived_toggle = "is_active" in changes and changes["is_active"] != skill.is_active
    for field, value in changes.items():
        if value is None:
            continue
        setattr(skill, field, value.strip() if isinstance(value, str) else value)

    if archived_toggle:
        action = "skill.restore" if skill.is_active else "skill.archive"
    else:
        action = "skill.update"
    _audit(db, admin, action, "skill", skill.id, ", ".join(sorted(changes)))
    await db.flush()
    return (await _skill_rows(db, [skill]))[0]


@router.post("/skills/reorder", response_model=list[SkillRow])
async def reorder_skills(payload: ReorderIn, admin: AdminUser, db: DbSession) -> list[SkillRow]:
    skills = {s.id: s for s in await _all_skills(db)}
    if len(payload.ids) != len(set(payload.ids)) or set(payload.ids) != set(skills):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Send every skill exactly once, in the new order."
        )
    for index, skill_id in enumerate(payload.ids):
        skills[skill_id].sort_order = (index + 1) * 10
    _audit(db, admin, "skill.reorder", "skill", None)
    await db.flush()
    return await _skill_rows(db, await _all_skills(db))


# =========================================================================== #
# audit log
# =========================================================================== #
class ActionRow(BaseModel):
    id: uuid.UUID
    admin_name: str
    action: str
    target_type: str
    target_id: uuid.UUID | None
    note: str
    created_at: datetime


@router.get("/actions", response_model=list[ActionRow])
async def audit_log(
    admin: AdminUser, db: DbSession, limit: int = Query(default=100, ge=1, le=500)
) -> list[ActionRow]:
    rows = (
        await db.execute(
            select(AdminAction, User)
            .outerjoin(User, AdminAction.admin_id == User.id)
            .order_by(AdminAction.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        ActionRow(
            id=action.id,
            admin_name=(user.full_name if user else "Removed admin"),
            action=action.action,
            target_type=action.target_type,
            target_id=action.target_id,
            note=action.note,
            created_at=action.created_at,
        )
        for action, user in rows
    ]
