"""Create demo accounts and a little activity between them.

    python -m app.db.seed_demo           # create or refresh
    python -m app.db.seed_demo --clear   # remove them all

Demo users get phone numbers in the reserved +9199000000XX range so they are
trivially identifiable and can never collide with a real signup. Sign in as any
of them through the phone OTP flow -- in development the code is shown on
screen.

    +919900000000..15   demo helpers (all with a live membership)
    +919900000097       Rahul Nair    a family WITH a membership -- can message
    +919900000098       Sahaya Admin  the admin panel
    +919900000099       Anu Varghese  a family WITHOUT one -- sees every paywall
"""

import asyncio
import shutil
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.seeds.demo import DEMO_HELPERS, DEMO_NOTIFICATIONS, DEMO_RATINGS
from app.db.session import SessionLocal
from app.models.billing import Plan, Subscription
from app.models.engagement import Favorite, Notification
from app.models.enums import (
    AuthProvider,
    CutoutStatus,
    HireRequestStatus,
    PlanCode,
    ReviewDirection,
    Shift,
    SubscriptionStatus,
    UserRole,
    VerificationStatus,
)
from app.models.geo import District, Town
from app.models.marketplace import HelperProfile, HireRequest, HirerProfile, Review
from app.models.messaging import Conversation, Message, ordered_pair
from app.models.taxonomy import HelperSkill, Service, Skill
from app.models.user import AuthIdentity, User

#: The portraits the demo cards use, in `design/`, and the storage keys they
#: are copied to. Cut-out PNGs from uifaces.co -- fixtures for development, not
#: for anything that ships.
DEMO_PORTRAITS: dict[str, str] = {
    "uifaces-human-avatar-removebg-preview.png": "demo/helper-1.png",
    "uifaces-popular-avatar-removebg-preview.png": "demo/helper-2.png",
    "uifaces-popular-avatar__1_-removebg-preview.png": "demo/helper-3.png",
}


def place_demo_portraits() -> int:
    """Copy the demo portraits into the storage root, framed as an upload is.

    Without this a fresh checkout seeds sixteen helpers whose photos 404, and
    the card's whole point -- a portrait breaking out of the header -- never
    appears. Existing files are left alone, so a re-seed is cheap.
    """
    from app.providers.imaging.base import Imaging

    source_dir = Path(__file__).resolve().parents[3] / "design"
    root = Path(settings.STORAGE_LOCAL_DIR)
    copied = 0

    for name, key in DEMO_PORTRAITS.items():
        target = root / key
        if target.exists():
            continue
        source = source_dir / name
        if not source.exists():
            print(f"  ! {source} is missing; demo cards will fall back to a monogram")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            # Framed on the way in, so a demo card and a real upload are
            # cropped the same way (DECISIONS.md 026).
            target.write_bytes(Imaging.frame_subject(source.read_bytes()))
        except Exception:
            shutil.copyfile(source, target)
        copied += 1
    return copied


DEMO_PREFIX = "+9199000000"

#: The family accounts and the admin sit at the top of the reserved range so
#: they can never collide with a demo helper index.
MEMBER_PHONE = f"{DEMO_PREFIX}97"
ADMIN_PHONE = f"{DEMO_PREFIX}98"
HIRER_PHONE = f"{DEMO_PREFIX}99"


def demo_phone(index: int) -> str:
    return f"{DEMO_PREFIX}{index:02d}"


async def clear(db: AsyncSession) -> int:
    """Remove every demo account.

    Deleting the user row cascades to their subscriptions, hire requests,
    reviews, conversations, messages, documents and hirer profile, so only the
    rows without a cascade are removed explicitly.
    """
    users = (
        (await db.execute(select(User).where(User.phone.like(f"{DEMO_PREFIX}%"))))
        .scalars()
        .all()
    )
    for user in users:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        if profile:
            await db.execute(
                delete(HelperSkill).where(HelperSkill.helper_profile_id == profile.id)
            )
            await db.execute(delete(HelperProfile).where(HelperProfile.id == profile.id))
        await db.execute(delete(Favorite).where(Favorite.user_id == user.id))
        await db.execute(delete(Notification).where(Notification.user_id == user.id))
        await db.execute(delete(AuthIdentity).where(AuthIdentity.user_id == user.id))
        await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return len(users)


async def _account(
    db: AsyncSession, *, phone: str, name: str, role: UserRole, now: datetime
) -> User:
    user = (
        await db.execute(select(User).where(User.phone == phone))
    ).scalar_one_or_none()
    if user is None:
        user = User(phone=phone, full_name=name, role=role, phone_verified_at=now)
        db.add(user)
        await db.flush()
        db.add(
            AuthIdentity(user_id=user.id, provider=AuthProvider.PHONE, provider_subject=phone)
        )
    user.full_name = name
    return user


async def seed(db: AsyncSession) -> int:
    services = {
        s.slug: s for s in (await db.execute(select(Service))).scalars().all()
    }
    skills = {s.slug: s for s in (await db.execute(select(Skill))).scalars().all()}
    districts = {
        d.slug: d for d in (await db.execute(select(District))).scalars().all()
    }
    towns = {t.slug: t for t in (await db.execute(select(Town))).scalars().all()}
    plan = (
        await db.execute(select(Plan).where(Plan.code == PlanCode.HELPER_MONTHLY))
    ).scalar_one()

    now = datetime.now(UTC)
    made = 0

    for index, row in enumerate(DEMO_HELPERS):
        (
            name, service_slug, skill_slugs, district_slug, town_slug,
            years, wage_min, wage_max, shifts, hours, live_in, languages, headline,
        ) = row

        user = await _account(
            db, phone=demo_phone(index), name=name, role=UserRole.HELPER, now=now
        )

        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        if profile is None:
            profile = HelperProfile(user_id=user.id)
            db.add(profile)
            await db.flush()

        town = towns.get(town_slug)
        if town is None:
            raise SystemExit(f"demo seed references unknown town: {town_slug}")

        profile.service_id = services[service_slug].id
        profile.district_id = districts[district_slug].id
        profile.town_id = town.id
        profile.headline = headline
        profile.bio = (
            f"{name.split()[0]} has {years} years of experience as a "
            f"{services[service_slug].name.lower()} in and around "
            f"{town.name}. Available for {'live-in or ' if live_in else ''}"
            f"daily work."
        )
        profile.experience_years = years
        profile.wage_monthly_min = wage_min
        profile.wage_monthly_max = wage_max
        profile.shifts = [Shift(s) for s in shifts]
        profile.hours_per_day = hours
        profile.willing_to_live_in = live_in
        profile.languages = languages
        profile.onboarding_step = 9
        profile.is_listed = True
        profile.admin_hidden = False

        # Real cut-out portraits, so the breaking-the-box card is exercised in
        # development rather than only ever showing the monogram fallback.
        # Three images cycled across sixteen helpers -- obviously repeating, but
        # the point is to prove the layout, not to fake a roster.
        profile.photo_cutout_key = f"demo/helper-{index % 3 + 1}.png"
        profile.photo_key = profile.photo_cutout_key
        profile.cutout_status = CutoutStatus.DONE

        # A spread of verification states, so the badges on the card are
        # actually exercised rather than all showing the same thing.
        profile.id_verification_status = (
            VerificationStatus.VERIFIED if index % 4 != 3 else VerificationStatus.PENDING
        )
        profile.police_verification_status = (
            VerificationStatus.VERIFIED if index % 3 == 0 else VerificationStatus.NONE
        )

        rating_avg, rating_count = DEMO_RATINGS[index % len(DEMO_RATINGS)]
        profile.rating_avg = rating_avg
        profile.rating_count = rating_count

        await db.execute(
            delete(HelperSkill).where(HelperSkill.helper_profile_id == profile.id)
        )
        for slug in skill_slugs:
            db.add(HelperSkill(helper_profile_id=profile.id, skill_id=skills[slug].id))

        # A live membership, since is_listed is meant to follow subscription state.
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.user_id == user.id)
            )
        ).scalar_one_or_none()
        if sub is None:
            sub = Subscription(user_id=user.id, plan_id=plan.id)
            db.add(sub)
        sub.status = SubscriptionStatus.ACTIVE
        sub.current_start = now - timedelta(days=10)
        sub.current_end = now + timedelta(days=20)
        sub.razorpay_subscription_id = f"sub_demo_{index:02d}"

        made += 1

    await db.commit()
    return made


async def seed_hirer(db: AsyncSession) -> None:
    """The family WITHOUT a membership, with real notifications behind her.

    Without this the header's alert badge has nothing to show in development,
    and a badge that is always empty is a badge nobody notices is broken.
    """
    now = datetime.now(UTC)
    user = await _account(
        db, phone=HIRER_PHONE, name="Anu Varghese", role=UserRole.HIRER, now=now
    )

    # Rewritten wholesale each run: these are fixtures, not history.
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    for offset_hours, (kind, title, body, link, read) in enumerate(DEMO_NOTIFICATIONS):
        db.add(
            Notification(
                user_id=user.id,
                kind=kind,
                title=title,
                body=body,
                link=link,
                read_at=now - timedelta(days=3) if read else None,
                created_at=now - timedelta(hours=offset_hours * 7 + 1),
            )
        )

    # A couple of saved helpers, so "Liked profiles" is not an empty state.
    await db.execute(delete(Favorite).where(Favorite.user_id == user.id))
    saved = (
        (
            await db.execute(
                select(HelperProfile.id).where(HelperProfile.is_listed.is_(True)).limit(3)
            )
        )
        .scalars()
        .all()
    )
    for helper_id in saved:
        db.add(Favorite(user_id=user.id, helper_profile_id=helper_id))

    await db.commit()


async def _hirer_profile(
    db: AsyncSession,
    user: User,
    *,
    district: District,
    town: Town,
    about: str,
    household: int,
) -> HirerProfile:
    profile = (
        await db.execute(select(HirerProfile).where(HirerProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        profile = HirerProfile(user_id=user.id)
        db.add(profile)
    profile.district_id = district.id
    profile.town_id = town.id
    profile.about = about
    profile.household_size = household
    profile.onboarding_step = 9
    return profile


async def seed_activity(db: AsyncSession) -> None:
    """The admin, a paying family, and some history between people.

    Rewritten wholesale each run -- these are fixtures, not history.
    """
    now = datetime.now(UTC)
    ernakulam = (
        await db.execute(select(District).where(District.slug == "ernakulam"))
    ).scalar_one()
    towns = {
        t.slug: t
        for t in (await db.execute(select(Town).where(Town.district_id == ernakulam.id)))
        .scalars()
        .all()
    }

    await _account(db, phone=ADMIN_PHONE, name="Sahaya Admin", role=UserRole.ADMIN, now=now)
    member = await _account(
        db, phone=MEMBER_PHONE, name="Rahul Nair", role=UserRole.HIRER, now=now
    )
    anu = (await db.execute(select(User).where(User.phone == HIRER_PHONE))).scalar_one()

    member_profile = await _hirer_profile(
        db,
        member,
        district=ernakulam,
        town=towns["ernakulam-edappally"],
        about="Two working parents and a grandmother at home in Edappally.",
        household=4,
    )
    await _hirer_profile(
        db,
        anu,
        district=ernakulam,
        town=towns["ernakulam-kakkanad"],
        about="Looking for help with my father after his knee surgery.",
        household=3,
    )

    # Rahul's membership -- the one account that can message out of the box.
    plan = (
        await db.execute(select(Plan).where(Plan.code == PlanCode.HIRER_MONTHLY))
    ).scalar_one()
    sub = (
        await db.execute(select(Subscription).where(Subscription.user_id == member.id))
    ).scalar_one_or_none()
    if sub is None:
        sub = Subscription(user_id=member.id, plan_id=plan.id)
        db.add(sub)
    sub.status = SubscriptionStatus.ACTIVE
    sub.current_start = now - timedelta(days=5)
    sub.current_end = now + timedelta(days=25)
    sub.razorpay_subscription_id = "sub_demo_member"

    sujatha = (await db.execute(select(User).where(User.phone == demo_phone(1)))).scalar_one()
    fathima = (await db.execute(select(User).where(User.phone == demo_phone(0)))).scalar_one()

    # Hire requests. Deleting them cascades to their reviews.
    await db.execute(delete(HireRequest).where(HireRequest.hirer_id.in_([member.id, anu.id])))
    finished = HireRequest(
        hirer_id=member.id,
        helper_id=sujatha.id,
        status=HireRequestStatus.COMPLETED,
        message="Cooking for four, weekday mornings and evenings.",
        created_at=now - timedelta(days=40),
        responded_at=now - timedelta(days=39),
        completed_at=now - timedelta(days=3),
    )
    waiting = HireRequest(
        hirer_id=anu.id,
        helper_id=fathima.id,
        status=HireRequestStatus.PENDING,
        message="Post-surgery care for my father, starting in about three weeks.",
        created_at=now - timedelta(hours=5),
    )
    db.add_all([finished, waiting])
    await db.flush()

    # Reviews both ways on the finished job. Written directly rather than
    # through the API so Sujatha keeps her seeded rating -- the API would
    # recompute it from this single review.
    db.add_all(
        [
            Review(
                hire_request_id=finished.id,
                rater_id=member.id,
                ratee_id=sujatha.id,
                direction=ReviewDirection.HIRER_TO_HELPER,
                rating=5,
                comment="Always on time, and the kids actually eat their vegetables now.",
                created_at=now - timedelta(days=2),
            ),
            Review(
                hire_request_id=finished.id,
                rater_id=sujatha.id,
                ratee_id=member.id,
                direction=ReviewDirection.HELPER_TO_HIRER,
                rating=5,
                comment="A kind family. Paid on the first of every month without asking.",
                created_at=now - timedelta(days=2),
            ),
        ]
    )
    member_profile.rating_avg = 5.0
    member_profile.rating_count = 1

    # One live conversation, so the chat page is not empty on first look.
    a, b = ordered_pair(member.id, sujatha.id)
    await db.execute(
        delete(Conversation).where(
            Conversation.participant_a_id == a, Conversation.participant_b_id == b
        )
    )
    convo = Conversation(participant_a_id=a, participant_b_id=b)
    db.add(convo)
    await db.flush()

    script = [
        (member, 26 * 60, "Hi Sujatha, are you free to start again on Monday?"),
        (sujatha, 25 * 60, "Yes, Monday works. Mornings and evenings like before?"),
        (member, 24 * 60, "Perfect. 7 to 10, and 5 to 8."),
        (sujatha, 90, "I will come a little early on the first day to see the kitchen."),
    ]
    for sender, minutes_ago, body in script:
        db.add(
            Message(
                conversation_id=convo.id,
                sender_id=sender.id,
                body=body,
                created_at=now - timedelta(minutes=minutes_ago),
            )
        )
    convo.last_message_at = now - timedelta(minutes=90)
    # Rahul has read up to his own last reply, so Sujatha's latest arrives unread.
    convo.mark_read(member.id, now - timedelta(minutes=24 * 60))
    convo.mark_read(sujatha.id, now - timedelta(minutes=90))

    await db.commit()


async def main() -> None:
    async with SessionLocal() as db:
        if "--clear" in sys.argv:
            print(f"removed {await clear(db)} demo accounts")
        else:
            placed = place_demo_portraits()
            count = await seed(db)
            await seed_hirer(db)
            await seed_activity(db)
            if placed:
                print(f"placed {placed} demo portrait(s) in the storage root")
            print(f"seeded {count} demo helpers")
            print(f"  {MEMBER_PHONE}  Rahul Nair    family with a membership")
            print(f"  {ADMIN_PHONE}  Sahaya Admin  admin")
            print(f"  {HIRER_PHONE}  Anu Varghese  family without one")


if __name__ == "__main__":
    asyncio.run(main())
