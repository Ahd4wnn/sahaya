"""The signed-in user's own things: saved helpers, notifications, settings.

The first two are what the circles in the site header are wired to, and both
are free -- saving a helper and reading an alert are not paid features. Only the
contact details behind a card are, and that gate lives in `helpers.py`.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.auth import _issue_and_maybe_reveal
from app.models.engagement import Favorite, Notification
from app.models.enums import AuthProvider, OtpChannel, OtpPurpose, UserRole, UserStatus
from app.models.geo import District, Town
from app.models.marketplace import HelperProfile
from app.models.taxonomy import Service
from app.models.user import AuthIdentity, RefreshToken, User
from app.schemas.auth import StartOut, UserOut, normalize_phone
from app.schemas.helper import HelperCard
from app.services.listings import card
from app.services.notify import DEFAULT_PREFS, effective_prefs
from app.services.otp_service import OtpError, verify_otp

router = APIRouter(tags=["me"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        phone=user.phone,
        full_name=user.full_name,
        role=user.role,
        email_verified=user.is_email_verified,
        phone_verified=user.is_phone_verified,
    )


# --------------------------------------------------------------------------- #
# favorites -- the "Liked profiles" list
# --------------------------------------------------------------------------- #
class FavoriteIdsOut(BaseModel):
    """Just the ids, for painting hearts on a grid of cards.

    The browse grid needs to know which of twenty-four cards are saved. Asking
    for twenty-four full profiles to answer that would be absurd, so the ids
    are their own endpoint and the client holds them in a Set.
    """

    ids: list[uuid.UUID]


@router.get("/me/favorites/ids", response_model=FavoriteIdsOut)
async def favorite_ids(user: CurrentUser, db: DbSession) -> FavoriteIdsOut:
    ids = (
        await db.execute(
            select(Favorite.helper_profile_id).where(Favorite.user_id == user.id)
        )
    ).scalars().all()
    return FavoriteIdsOut(ids=list(ids))


@router.get("/me/favorites", response_model=list[HelperCard])
async def favorites(user: CurrentUser, db: DbSession) -> list[HelperCard]:
    rows = (
        await db.execute(
            select(HelperProfile, User, Service, District, Town)
            .join(Favorite, Favorite.helper_profile_id == HelperProfile.id)
            .join(User, HelperProfile.user_id == User.id)
            .outerjoin(Service, HelperProfile.service_id == Service.id)
            .outerjoin(District, HelperProfile.district_id == District.id)
            .outerjoin(Town, HelperProfile.town_id == Town.id)
            .options(selectinload(HelperProfile.skills))
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc())
        )
    ).all()
    return [HelperCard(**card(p, u, s, d, t)) for p, u, s, d, t in rows]


@router.put("/me/favorites/{helper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(
    helper_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    """PUT, not POST -- saving an already-saved helper is a no-op, not an error.

    `ON CONFLICT DO NOTHING` rather than a read-then-write, so two tabs racing
    on the same heart cannot both decide the row is absent.
    """
    if await db.get(HelperProfile, helper_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")

    await db.execute(
        pg_insert(Favorite)
        .values(user_id=user.id, helper_profile_id=helper_id)
        .on_conflict_do_nothing(constraint="uq_favorite_pair")
    )
    await db.commit()


@router.delete("/me/favorites/{helper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    helper_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    await db.execute(
        delete(Favorite).where(
            Favorite.user_id == user.id, Favorite.helper_profile_id == helper_id
        )
    )
    await db.commit()


# --------------------------------------------------------------------------- #
# notifications -- the pinned "Sahaya" thread and the header badge
# --------------------------------------------------------------------------- #
class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    link: str
    read: bool
    created_at: datetime


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unread: int


@router.get("/me/notifications", response_model=NotificationsOut)
async def notifications(
    user: CurrentUser, db: DbSession, limit: int = 20
) -> NotificationsOut:
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(min(limit, 100))
        )
    ).scalars().all()

    unread = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        )
    ).scalar_one()

    return NotificationsOut(
        items=[
            NotificationOut(
                id=n.id,
                kind=n.kind,
                title=n.title,
                body=n.body,
                link=n.link,
                read=n.read_at is not None,
                created_at=n.created_at,
            )
            for n in rows
        ],
        unread=unread,
    )


@router.post("/me/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(user: CurrentUser, db: DbSession) -> None:
    """Marks everything read. Opening the panel is the acknowledgement.

    Per-item read state would be more precise and would also mean the badge
    stays lit after the user has plainly seen the list, which reads as broken.
    """
    now = datetime.now(UTC)
    await db.execute(
        Notification.__table__.update()
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()


# --------------------------------------------------------------------------- #
# settings
# --------------------------------------------------------------------------- #
class MePatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)


@router.patch("/me", response_model=UserOut)
async def update_me(payload: MePatch, user: CurrentUser, db: DbSession) -> UserOut:
    if payload.full_name:
        user.full_name = payload.full_name.strip()
    await db.flush()
    return _user_out(user)


class SettingsOut(BaseModel):
    notification_prefs: dict[str, bool]


class SettingsPatch(BaseModel):
    notification_prefs: dict[str, bool]

    @field_validator("notification_prefs")
    @classmethod
    def _known_keys(cls, value: dict[str, bool]) -> dict[str, bool]:
        unknown = set(value) - set(DEFAULT_PREFS)
        if unknown:
            raise ValueError(f"Unknown notification settings: {sorted(unknown)}")
        return value


@router.get("/me/settings", response_model=SettingsOut)
async def get_settings(user: CurrentUser) -> SettingsOut:
    return SettingsOut(notification_prefs=effective_prefs(user))


@router.patch("/me/settings", response_model=SettingsOut)
async def update_settings(
    payload: SettingsPatch, user: CurrentUser, db: DbSession
) -> SettingsOut:
    # Reassigned rather than mutated in place: SQLAlchemy does not track
    # in-place changes to a JSONB dict, and a mutation would silently not save.
    user.notification_prefs = {**(user.notification_prefs or {}), **payload.notification_prefs}
    await db.flush()
    return SettingsOut(notification_prefs=effective_prefs(user))


class ContactIn(BaseModel):
    """A new email address or phone number -- exactly one."""

    email: EmailStr | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalize_phone(value) if value else value

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.email is None) == (self.phone is None):
            raise ValueError("Give exactly one of email or phone")
        return self

    def resolve(self) -> tuple[str, OtpChannel, OtpPurpose, AuthProvider]:
        if self.email is not None:
            return str(self.email), OtpChannel.EMAIL, OtpPurpose.VERIFY_EMAIL, AuthProvider.EMAIL
        return self.phone, OtpChannel.SMS, OtpPurpose.VERIFY_PHONE, AuthProvider.PHONE


class ContactVerifyIn(ContactIn):
    code: str = Field(min_length=4, max_length=8)


async def _taken_by_someone_else(db, user: User, target: str, is_email: bool) -> bool:
    column = User.email if is_email else User.phone
    return (
        await db.execute(select(User.id).where(column == target, User.id != user.id))
    ).first() is not None


@router.post("/me/contact/start", response_model=StartOut)
async def contact_start(payload: ContactIn, user: CurrentUser, db: DbSession) -> StartOut:
    """Send a code to the NEW address. Nothing changes until it is verified --
    trusting an unverified address would let anyone point an account at an
    inbox they do not own."""
    target, channel, purpose, _ = payload.resolve()
    is_email = channel is OtpChannel.EMAIL
    if await _taken_by_someone_else(db, user, target, is_email):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"That {'email address' if is_email else 'number'} is already on another "
            "Sahaya account.",
        )
    return await _issue_and_maybe_reveal(db, target=target, channel=channel, purpose=purpose)


@router.post("/me/contact/verify", response_model=UserOut)
async def contact_verify(
    payload: ContactVerifyIn, user: CurrentUser, db: DbSession
) -> UserOut:
    target, channel, purpose, provider = payload.resolve()
    is_email = channel is OtpChannel.EMAIL

    try:
        await verify_otp(db, target=target, purpose=purpose, code=payload.code)
    except OtpError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    if await _taken_by_someone_else(db, user, target, is_email):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That address was just claimed by another account."
        )
    existing = (
        await db.execute(
            select(AuthIdentity).where(
                AuthIdentity.provider == provider, AuthIdentity.provider_subject == target
            )
        )
    ).scalar_one_or_none()
    if existing is not None and existing.user_id != user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That address is linked to another Sahaya account."
        )

    # Retire the old sign-in identity. Leaving it would mean the number someone
    # just moved away from -- possibly one they no longer own -- still signs
    # into this account.
    old = user.email if is_email else user.phone
    if old and old != target:
        await db.execute(
            delete(AuthIdentity).where(
                AuthIdentity.user_id == user.id,
                AuthIdentity.provider == provider,
                AuthIdentity.provider_subject == old,
            )
        )
    if existing is None:
        db.add(AuthIdentity(user_id=user.id, provider=provider, provider_subject=target))

    now = datetime.now(UTC)
    if is_email:
        user.email, user.email_verified_at = target, now
    else:
        user.phone, user.phone_verified_at = target, now
    await db.flush()
    return _user_out(user)


@router.post("/me/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate(user: CurrentUser, db: DbSession) -> None:
    """Close the account without destroying it.

    Status flips to DELETED, every session is revoked, and a helper's card comes
    off the grid. Ratings, reviews and hire history are kept -- the people on
    the other side of them still rely on them -- and support can restore the
    account.
    """
    now = datetime.now(UTC)
    user.status = UserStatus.DELETED
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    if user.role is UserRole.HELPER:
        await db.execute(
            update(HelperProfile)
            .where(HelperProfile.user_id == user.id)
            .values(is_listed=False)
        )
    await db.commit()
