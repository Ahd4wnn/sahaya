"""A family's own profile.

Thinner than a helper's on purpose: a household needs a name, an area and a
line about the work. Everything a helper might want to know before accepting
-- how the family treats people -- lives in their reviews, not in fields they
fill in about themselves.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, has_active_subscription
from app.models.enums import UserRole
from app.models.geo import District, Town
from app.models.marketplace import HirerProfile
from app.models.user import User

router = APIRouter(tags=["hirers"])


class HirerIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    household_size: int | None = Field(default=None, ge=1, le=30)
    about: str | None = Field(default=None, max_length=1000)
    district: str | None = None
    town: str | None = None
    landmark: str | None = Field(default=None, max_length=160)


class HirerOut(BaseModel):
    full_name: str
    household_size: int | None
    about: str
    district: str | None
    district_name: str | None
    town: str | None
    town_name: str | None
    landmark: str
    rating_avg: float | None
    rating_count: int
    has_active_subscription: bool


async def _own_profile(db, user: User) -> HirerProfile:
    if user.role is not UserRole.HIRER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is a family-only page.")
    profile = (
        await db.execute(select(HirerProfile).where(HirerProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        # Accounts made before profiles were created at signup have none yet.
        profile = HirerProfile(user_id=user.id)
        db.add(profile)
        await db.flush()
    return profile


async def _out(db, user: User, profile: HirerProfile) -> HirerOut:
    district = await db.get(District, profile.district_id) if profile.district_id else None
    town = await db.get(Town, profile.town_id) if profile.town_id else None
    return HirerOut(
        full_name=user.full_name,
        household_size=profile.household_size,
        about=profile.about,
        district=district.slug if district else None,
        district_name=district.name if district else None,
        town=town.slug if town else None,
        town_name=town.name if town else None,
        landmark=profile.landmark,
        rating_avg=float(profile.rating_avg) if profile.rating_avg else None,
        rating_count=profile.rating_count,
        has_active_subscription=await has_active_subscription(db, user.id),
    )


@router.get("/hirers/me", response_model=HirerOut)
async def get_me(user: CurrentUser, db: DbSession) -> HirerOut:
    return await _out(db, user, await _own_profile(db, user))


@router.patch("/hirers/me", response_model=HirerOut)
async def update_me(payload: HirerIn, user: CurrentUser, db: DbSession) -> HirerOut:
    profile = await _own_profile(db, user)
    data = payload.model_dump(exclude_unset=True)

    if data.get("full_name"):
        user.full_name = data.pop("full_name").strip()
    data.pop("full_name", None)

    if "district" in data:
        slug = data.pop("district")
        if slug is None:
            profile.district_id = None
            profile.town_id = None
        else:
            district = (
                await db.execute(select(District).where(District.slug == slug))
            ).scalar_one_or_none()
            if district is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown district: {slug}")
            if profile.district_id != district.id:
                profile.town_id = None
            profile.district_id = district.id

    if "town" in data:
        slug = data.pop("town")
        if slug is None:
            profile.town_id = None
        else:
            town = (
                await db.execute(select(Town).where(Town.slug == slug))
            ).scalar_one_or_none()
            if town is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown town: {slug}")
            if profile.district_id and town.district_id != profile.district_id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "That town is not in the selected district.",
                )
            profile.town_id = town.id

    for field, value in data.items():
        setattr(profile, field, value if value is not None else getattr(profile, field))

    await db.flush()
    return await _out(db, user, profile)
