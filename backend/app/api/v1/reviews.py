"""Reviews, in both directions (docs/DECISIONS.md 008).

A family rates the helper and the helper rates the family, once each per
completed hire. `UNIQUE (hire_request_id, direction)` is the enforcement; this
module only translates the constraint into a sentence.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.models.enums import HireRequestStatus, ReviewDirection, UserRole
from app.models.marketplace import HelperProfile, HireRequest, HirerProfile, Review
from app.models.user import User
from app.services.notify import notify

router = APIRouter(tags=["reviews"])


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class ReviewOut(BaseModel):
    id: uuid.UUID
    rating: int
    comment: str
    created_at: datetime
    direction: ReviewDirection
    #: "Anu V." -- first name and an initial. Enough to feel like a person,
    #: not enough to look someone up.
    rater_name: str
    rater_role: UserRole


def _display_name(user: User) -> str:
    parts = (user.full_name or "").split()
    if not parts:
        return "A Sahaya member"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


async def recalculate_rating(db, user_id: uuid.UUID) -> None:
    """Rebuild a person's average from their reviews.

    Recomputed from scratch rather than nudged incrementally: an incremental
    average drifts the first time anything is ever edited or deleted, and at
    this volume the aggregate is cheap.
    """
    avg, count = (
        await db.execute(
            select(func.avg(Review.rating), func.count()).where(Review.ratee_id == user_id)
        )
    ).one()
    user = await db.get(User, user_id)
    model = {UserRole.HELPER: HelperProfile, UserRole.HIRER: HirerProfile}.get(user.role)
    if model is None:
        return
    profile = (
        await db.execute(select(model).where(model.user_id == user_id))
    ).scalar_one_or_none()
    if profile is None:
        return
    profile.rating_avg = round(float(avg), 1) if count else None
    profile.rating_count = count


async def _reviews_for(db, ratee_id: uuid.UUID, limit: int) -> list[ReviewOut]:
    rows = (
        await db.execute(
            select(Review, User)
            .join(User, Review.rater_id == User.id)
            .where(Review.ratee_id == ratee_id)
            .order_by(Review.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        ReviewOut(
            id=review.id,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
            direction=review.direction,
            rater_name=_display_name(rater),
            rater_role=rater.role,
        )
        for review, rater in rows
    ]


@router.post(
    "/hires/{hire_id}/review",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
)
async def leave_review(
    hire_id: uuid.UUID, payload: ReviewIn, user: CurrentUser, db: DbSession
) -> ReviewOut:
    hire = await db.get(HireRequest, hire_id)
    if hire is None or user.id not in (hire.hirer_id, hire.helper_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")
    if hire.status is not HireRequestStatus.COMPLETED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You can leave a review once the work is marked complete.",
        )

    i_am_hirer = user.id == hire.hirer_id
    review = Review(
        hire_request_id=hire.id,
        rater_id=user.id,
        ratee_id=hire.helper_id if i_am_hirer else hire.hirer_id,
        direction=(
            ReviewDirection.HIRER_TO_HELPER if i_am_hirer else ReviewDirection.HELPER_TO_HIRER
        ),
        rating=payload.rating,
        comment=payload.comment.strip(),
    )
    db.add(review)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You have already reviewed this."
        ) from None
    await db.refresh(review)

    await recalculate_rating(db, review.ratee_id)
    first = (user.full_name or "Someone").split()[0]
    await notify(
        db,
        user_id=review.ratee_id,
        kind="review",
        title=f"{first} left you a {payload.rating}-star review",
        body=review.comment[:140],
        link="/account",
    )
    return ReviewOut(
        id=review.id,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
        direction=review.direction,
        rater_name=_display_name(user),
        rater_role=user.role,
    )


@router.get("/helpers/{helper_id}/reviews", response_model=list[ReviewOut])
async def helper_reviews(
    helper_id: uuid.UUID, db: DbSession, limit: int = Query(default=20, ge=1, le=50)
) -> list[ReviewOut]:
    """Public. A helper's profile page is keyed by profile id, not user id."""
    profile = await db.get(HelperProfile, helper_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")
    return await _reviews_for(db, profile.user_id, limit)


@router.get("/users/{user_id}/reviews", response_model=list[ReviewOut])
async def user_reviews(
    user_id: uuid.UUID, db: DbSession, limit: int = Query(default=20, ge=1, le=50)
) -> list[ReviewOut]:
    """Public -- a family's reviews are as visible as a helper's (DECISIONS 008)."""
    return await _reviews_for(db, user_id, limit)
