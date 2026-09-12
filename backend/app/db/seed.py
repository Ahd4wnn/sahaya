"""Idempotent seeding of reference data.

Run with:  python -m app.db.seed

Safe to run repeatedly -- every row is matched on its natural key and updated
rather than duplicated, so adding a town later is just a re-run.

The exception is the taxonomy. Once a service or a skill exists it belongs to
the admin panel (Admin -> Categories, Admin -> Skills), and a re-seed must never
undo a rename, a reorder or an archive someone made there. Both are therefore
insert-only.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seeds.kerala import DISTRICTS, TOWNS, town_slug
from app.db.seeds.taxonomy import NAV_SERVICES, PLANS, SERVICES, SKILLS
from app.db.session import SessionLocal
from app.models.billing import Plan
from app.models.enums import PlanCode
from app.models.geo import District, Town
from app.models.taxonomy import Service, Skill


async def seed_geo(db: AsyncSession) -> tuple[int, int]:
    districts_by_slug: dict[str, District] = {}

    for order, (slug, name, name_ml) in enumerate(DISTRICTS):
        row = (
            await db.execute(select(District).where(District.slug == slug))
        ).scalar_one_or_none()
        if row is None:
            row = District(slug=slug)
            db.add(row)
        row.name, row.name_ml, row.sort_order = name, name_ml, order
        districts_by_slug[slug] = row

    await db.flush()

    town_count = 0
    for district_slug, towns in TOWNS.items():
        district = districts_by_slug[district_slug]
        for name, is_major in towns:
            slug = town_slug(district_slug, name)
            row = (
                await db.execute(select(Town).where(Town.slug == slug))
            ).scalar_one_or_none()
            if row is None:
                row = Town(slug=slug, district_id=district.id)
                db.add(row)
            row.name, row.is_major, row.district_id = name, is_major, district.id
            town_count += 1

    await db.flush()
    return len(DISTRICTS), town_count


async def seed_taxonomy(db: AsyncSession) -> tuple[int, int]:
    for slug, name, name_ml, icon, order in SERVICES:
        exists = (
            await db.execute(select(Service.id).where(Service.slug == slug))
        ).first()
        if exists:
            continue  # admin-managed from here on -- see the module docstring
        db.add(
            Service(
                slug=slug,
                name=name,
                name_ml=name_ml,
                icon=icon,
                sort_order=order,
                show_in_nav=slug in NAV_SERVICES,
                nav_label=NAV_SERVICES.get(slug, ""),
            )
        )

    for slug, name, name_ml, order in SKILLS:
        exists = (await db.execute(select(Skill.id).where(Skill.slug == slug))).first()
        if exists:
            continue  # admin-managed from here on -- see the module docstring
        db.add(Skill(slug=slug, name=name, name_ml=name_ml, sort_order=order))

    await db.flush()
    return len(SERVICES), len(SKILLS)


async def seed_plans(db: AsyncSession) -> int:
    """Create local plan rows.

    razorpay_plan_id stays NULL until the plans are created in the Razorpay
    dashboard (or via the API) and the IDs are filled in. Nothing here talks to
    Razorpay, so seeding works offline and without credentials.
    """
    for code, name, description, amount in PLANS:
        plan_code = PlanCode(code)
        row = (
            await db.execute(select(Plan).where(Plan.code == plan_code))
        ).scalar_one_or_none()
        if row is None:
            row = Plan(code=plan_code)
            db.add(row)
        row.name, row.description, row.amount_paise = name, description, amount
        row.interval_unit = "monthly"

    await db.flush()
    return len(PLANS)


async def main() -> None:
    async with SessionLocal() as db:
        districts, towns = await seed_geo(db)
        services, skills = await seed_taxonomy(db)
        plans = await seed_plans(db)
        await db.commit()

    print(
        f"seeded: {districts} districts, {towns} towns, "
        f"{services} services, {skills} skills, {plans} plans"
    )


if __name__ == "__main__":
    asyncio.run(main())
