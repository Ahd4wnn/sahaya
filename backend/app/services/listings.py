"""The listing query and the card it returns.

Lives here rather than in app/api/v1/helpers.py because two callers need it:
GET /helpers, and Ask Sahaya's search tool. A service importing an API module
to reach it would be the wrong way round -- and, concretely, a circular import
(app.api.v1 loads every router, one of which loads the assistant).

One definition also means the assistant cannot quietly disagree with the front
page about who is listed, including the two `where` clauses that decide it.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.enums import Shift, VerificationStatus
from app.models.geo import District, Town
from app.models.marketplace import HelperProfile
from app.models.taxonomy import HelperSkill, Service, Skill
from app.models.user import User
from app.providers.registry import get_storage
from app.schemas.helper import BrowseOut, HelperCard, SkillOut


def card(
    profile: HelperProfile,
    user: User,
    service: Service | None,
    district: District | None,
    town: Town | None,
) -> dict:
    storage = get_storage()
    return {
        "id": profile.id,
        "full_name": user.full_name,
        "service": service.slug if service else None,
        "service_name": service.name if service else None,
        "headline": profile.headline,
        "skills": [
            SkillOut(slug=s.slug, name=s.name, name_ml=s.name_ml)
            for s in profile.skills
        ],
        "experience_years": profile.experience_years,
        "wage_monthly_min": profile.wage_monthly_min,
        "wage_monthly_max": profile.wage_monthly_max,
        "shifts": profile.shifts or [],
        "hours_per_day": profile.hours_per_day,
        "willing_to_live_in": profile.willing_to_live_in,
        "languages": profile.languages or [],
        "district": district.slug if district else None,
        "district_name": district.name if district else None,
        "town": town.slug if town else None,
        "town_name": town.name if town else None,
        "photo_url": storage.url_for(key=profile.photo_key) if profile.photo_key else None,
        "cutout_url": (
            storage.url_for(key=profile.photo_cutout_key)
            if profile.photo_cutout_key
            else None
        ),
        "cutout_status": profile.cutout_status,
        "id_verified": profile.id_verification_status is VerificationStatus.VERIFIED,
        "police_verified": (
            profile.police_verification_status is VerificationStatus.VERIFIED
        ),
        "rating_avg": float(profile.rating_avg) if profile.rating_avg else None,
        "rating_count": profile.rating_count,
    }


async def load_related(db, profile: HelperProfile):
    service = await db.get(Service, profile.service_id) if profile.service_id else None
    district = (
        await db.get(District, profile.district_id) if profile.district_id else None
    )
    town = await db.get(Town, profile.town_id) if profile.town_id else None
    return service, district, town


async def search_profiles(
    db,
    *,
    district: str | None = None,
    town: str | None = None,
    service: str | None = None,
    skills: list[str] | None = None,
    live_in: bool | None = None,
    shift: Shift | None = None,
    wage_max: int | None = None,
    q: str | None = None,
    sort: str = "rating",
    limit: int = 24,
    offset: int = 0,
) -> BrowseOut:
    """The listing search, as a function.

    GET /helpers is a thin wrapper over this, and so is the assistant's search
    tool (app/services/assistant/tools.py).
    """
    stmt = (
        select(HelperProfile, User, Service, District, Town)
        .join(User, HelperProfile.user_id == User.id)
        .outerjoin(Service, HelperProfile.service_id == Service.id)
        .outerjoin(District, HelperProfile.district_id == District.id)
        .outerjoin(Town, HelperProfile.town_id == Town.id)
        .options(selectinload(HelperProfile.skills))
        .where(
            HelperProfile.is_listed.is_(True),
            # Moderation, separate from listing -- see HelperProfile.admin_hidden.
            HelperProfile.admin_hidden.is_(False),
        )
    )

    if district:
        stmt = stmt.where(District.slug == district)
    if town:
        stmt = stmt.where(Town.slug == town)
    if service:
        stmt = stmt.where(Service.slug == service)
    if live_in is not None:
        stmt = stmt.where(HelperProfile.willing_to_live_in.is_(live_in))
    if shift is not None:
        stmt = stmt.where(HelperProfile.shifts.any(shift))
    if wage_max is not None:
        stmt = stmt.where(HelperProfile.wage_monthly_min <= wage_max)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            User.full_name.ilike(pattern) | HelperProfile.headline.ilike(pattern)
        )
    if skills:
        # Require ALL selected skills, not any -- a hirer who picks "cooking"
        # and "elder care" wants someone who does both.
        for slug in skills:
            stmt = stmt.where(
                HelperProfile.id.in_(
                    select(HelperSkill.helper_profile_id)
                    .join(Skill, HelperSkill.skill_id == Skill.id)
                    .where(Skill.slug == slug)
                )
            )

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()

    order = {
        "rating": HelperProfile.rating_avg.desc().nullslast(),
        "wage_low": HelperProfile.wage_monthly_min.asc(),
        "wage_high": HelperProfile.wage_monthly_max.desc(),
        "newest": HelperProfile.created_at.desc(),
    }[sort]
    rows = (await db.execute(stmt.order_by(order).limit(limit).offset(offset))).all()

    return BrowseOut(
        items=[
            HelperCard(**card(p, u, s, d, t)) for p, u, s, d, t in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
