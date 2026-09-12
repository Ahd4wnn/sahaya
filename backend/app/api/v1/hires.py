"""Hire requests: a family asks, a helper answers, either side marks it done.

Every transition writes a notification to the other person, which is most of
what fills the pinned "Sahaya" thread in chat.
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession, has_active_subscription
from app.models.enums import HireRequestStatus, UserRole
from app.models.marketplace import HelperProfile, HireRequest, Review
from app.models.user import User
from app.providers.registry import get_storage
from app.services.notify import notify

router = APIRouter(tags=["hires"])

Side = Literal["hirer", "helper"]


class HireIn(BaseModel):
    message: str = Field(default="", max_length=1000)


class HireAction(BaseModel):
    action: Literal["accept", "decline", "withdraw", "complete"]


class CounterpartOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    role: UserRole
    helper_profile_id: uuid.UUID | None
    photo_url: str | None


class HireOut(BaseModel):
    id: uuid.UUID
    status: HireRequestStatus
    message: str
    created_at: datetime
    responded_at: datetime | None
    completed_at: datetime | None
    i_am: Side
    counterpart: CounterpartOut
    #: True once the work is complete and this side has not reviewed yet.
    can_review: bool
    my_review_rating: int | None


#: action -> (who may take it, the status it must be in, the status it leaves).
#: The whole state machine is this table; nothing else moves a request.
TRANSITIONS: dict[str, tuple[str, HireRequestStatus, HireRequestStatus]] = {
    "accept": ("helper", HireRequestStatus.PENDING, HireRequestStatus.ACCEPTED),
    "decline": ("helper", HireRequestStatus.PENDING, HireRequestStatus.DECLINED),
    "withdraw": ("hirer", HireRequestStatus.PENDING, HireRequestStatus.WITHDRAWN),
    "complete": ("either", HireRequestStatus.ACCEPTED, HireRequestStatus.COMPLETED),
}

#: What the other person is told, by action.
ANNOUNCEMENTS: dict[str, tuple[str, str]] = {
    "accept": (
        "{name} accepted your request",
        "Message them to agree the timings and a start date.",
    ),
    "decline": (
        "{name} declined your request",
        "They cannot take this on. Other helpers nearby may be free.",
    ),
    "withdraw": (
        "{name} withdrew their request",
        "The family is no longer looking for this role.",
    ),
    "complete": (
        "{name} marked the work complete",
        "Leave a review -- it helps the next family, and the next helper.",
    ),
}


def _first_name(user: User) -> str:
    return (user.full_name or "Someone").split()[0]


def _side(hire: HireRequest, user: User) -> Side | None:
    if hire.hirer_id == user.id:
        return "hirer"
    if hire.helper_id == user.id:
        return "helper"
    return None


async def _counterpart(db, user_id: uuid.UUID) -> CounterpartOut:
    user = await db.get(User, user_id)
    profile = None
    if user.role is UserRole.HELPER:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
    storage = get_storage()
    return CounterpartOut(
        user_id=user.id,
        full_name=user.full_name or "Sahaya member",
        role=user.role,
        helper_profile_id=profile.id if profile else None,
        photo_url=(
            storage.url_for(key=profile.photo_key)
            if profile and profile.photo_key
            else None
        ),
    )


async def _hire_out(db, hire: HireRequest, me: User, my_rating: int | None) -> HireOut:
    side = _side(hire, me)
    other_id = hire.helper_id if side == "hirer" else hire.hirer_id
    return HireOut(
        id=hire.id,
        status=hire.status,
        message=hire.message,
        created_at=hire.created_at,
        responded_at=hire.responded_at,
        completed_at=hire.completed_at,
        i_am=side,
        counterpart=await _counterpart(db, other_id),
        can_review=hire.status is HireRequestStatus.COMPLETED and my_rating is None,
        my_review_rating=my_rating,
    )


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #
@router.post(
    "/helpers/{helper_id}/hire",
    response_model=HireOut,
    status_code=status.HTTP_201_CREATED,
)
async def request_hire(
    helper_id: uuid.UUID, payload: HireIn, user: CurrentUser, db: DbSession
) -> HireOut:
    if user.role is not UserRole.HIRER:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only families can send hire requests."
        )
    if not await has_active_subscription(db, user.id):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "A Sahaya membership is needed to send hire requests.",
        )

    profile = await db.get(HelperProfile, helper_id)
    if profile is None or not profile.is_listed or profile.admin_hidden:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")

    open_request = (
        await db.execute(
            select(HireRequest).where(
                HireRequest.hirer_id == user.id,
                HireRequest.helper_id == profile.user_id,
                HireRequest.status.in_(
                    (HireRequestStatus.PENDING, HireRequestStatus.ACCEPTED)
                ),
            )
        )
    ).scalar_one_or_none()
    if open_request is not None:
        helper = await db.get(User, profile.user_id)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"You already have an open request with {_first_name(helper)}.",
        )

    hire = HireRequest(
        hirer_id=user.id, helper_id=profile.user_id, message=payload.message.strip()
    )
    db.add(hire)
    await db.flush()
    await db.refresh(hire)

    await notify(
        db,
        user_id=profile.user_id,
        kind="hire_request",
        title=f"{_first_name(user)} wants to hire you",
        body=hire.message or "Open your requests to accept or decline.",
        link="/hires",
    )
    return await _hire_out(db, hire, user, my_rating=None)


@router.get("/me/hires", response_model=list[HireOut])
async def my_hires(user: CurrentUser, db: DbSession) -> list[HireOut]:
    """Sent requests for a family, received requests for a helper."""
    rows = (
        await db.execute(
            select(HireRequest)
            .where(or_(HireRequest.hirer_id == user.id, HireRequest.helper_id == user.id))
            .order_by(HireRequest.created_at.desc())
        )
    ).scalars().all()
    if not rows:
        return []

    mine = (
        await db.execute(
            select(Review.hire_request_id, Review.rating).where(
                Review.hire_request_id.in_([h.id for h in rows]),
                Review.rater_id == user.id,
            )
        )
    ).all()
    my_ratings = {hire_id: rating for hire_id, rating in mine}
    return [await _hire_out(db, h, user, my_ratings.get(h.id)) for h in rows]


@router.patch("/hires/{hire_id}", response_model=HireOut)
async def act_on_hire(
    hire_id: uuid.UUID, payload: HireAction, user: CurrentUser, db: DbSession
) -> HireOut:
    hire = await db.get(HireRequest, hire_id)
    side = _side(hire, user) if hire else None
    if hire is None or side is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")

    who, must_be, becomes = TRANSITIONS[payload.action]
    if who != "either" and who != side:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Only the {'helper' if who == 'helper' else 'family'} can do that.",
        )
    if hire.status is not must_be:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This request is already {hire.status.value}."
        )

    now = datetime.now(UTC)
    hire.status = becomes
    if payload.action in ("accept", "decline"):
        hire.responded_at = now
    if payload.action == "complete":
        hire.completed_at = now

    title, body = ANNOUNCEMENTS[payload.action]
    await notify(
        db,
        user_id=hire.helper_id if side == "hirer" else hire.hirer_id,
        kind="hire_request",
        title=title.format(name=_first_name(user)),
        body=body,
        link="/hires",
    )
    await db.flush()
    return await _hire_out(db, hire, user, my_rating=None)
