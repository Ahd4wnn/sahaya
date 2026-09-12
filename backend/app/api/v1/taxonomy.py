"""Services, skills and Kerala geography.

Public and cacheable. These endpoints exist so web, Android and iOS cannot drift
-- adding a skill or a town appears everywhere with no app release.

Services are admin-managed (Admin -> Categories), so this is also how an admin's
rename, reorder or archive reaches the front page: the tab row, the search
bar's picker and the header nav all read from here.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession
from app.models.geo import District, Town
from app.models.taxonomy import Service, Skill

router = APIRouter(tags=["taxonomy"])


class ServiceOut(BaseModel):
    slug: str
    name: str
    name_ml: str
    icon: str
    #: Whether this service earns a slot in the site header.
    show_in_nav: bool
    #: The header's wording, already resolved -- `nav_label` when an admin set
    #: one, `name` otherwise -- so no client has to know the fallback rule.
    nav_label: str


class SkillOut(BaseModel):
    slug: str
    name: str
    name_ml: str


class TaxonomyOut(BaseModel):
    services: list[ServiceOut]
    skills: list[SkillOut]


class DistrictOut(BaseModel):
    slug: str
    name: str
    name_ml: str


class TownOut(BaseModel):
    slug: str
    name: str
    name_ml: str
    is_major: bool
    district: str


@router.get("/taxonomy", response_model=TaxonomyOut)
async def taxonomy(db: DbSession) -> TaxonomyOut:
    # Archived services are filtered here and nowhere else, so every surface
    # that lists services agrees about which ones exist.
    services = (
        await db.execute(
            select(Service)
            .where(Service.is_active.is_(True))
            .order_by(Service.sort_order, Service.name)
        )
    ).scalars().all()
    # Archived skills are filtered here and nowhere else, for the same reason
    # services are: every surface that lists them then agrees.
    skills = (
        await db.execute(
            select(Skill)
            .where(Skill.is_active.is_(True))
            .order_by(Skill.sort_order, Skill.name)
        )
    ).scalars().all()
    return TaxonomyOut(
        services=[
            ServiceOut(
                slug=s.slug,
                name=s.name,
                name_ml=s.name_ml,
                icon=s.icon,
                show_in_nav=s.show_in_nav,
                nav_label=s.nav_label or s.name,
            )
            for s in services
        ],
        skills=[
            SkillOut(slug=s.slug, name=s.name, name_ml=s.name_ml) for s in skills
        ],
    )


@router.get("/geo/districts", response_model=list[DistrictOut])
async def districts(db: DbSession) -> list[DistrictOut]:
    rows = (
        await db.execute(select(District).order_by(District.sort_order))
    ).scalars().all()
    return [
        DistrictOut(slug=d.slug, name=d.name, name_ml=d.name_ml) for d in rows
    ]


@router.get("/geo/towns", response_model=list[TownOut])
async def towns(
    db: DbSession,
    district: str | None = Query(default=None, description="District slug"),
) -> list[TownOut]:
    stmt = select(Town, District).join(District, Town.district_id == District.id)
    if district:
        stmt = stmt.where(District.slug == district)
    stmt = stmt.order_by(Town.is_major.desc(), Town.name)
    rows = (await db.execute(stmt)).all()
    return [
        TownOut(
            slug=t.slug,
            name=t.name,
            name_ml=t.name_ml,
            is_major=t.is_major,
            district=d.slug,
        )
        for t, d in rows
    ]
