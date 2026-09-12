"""Helper profiles: building one, browsing them, and the contact paywall."""

import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    CurrentUser,
    DbSession,
    MaybeUser,
    has_active_subscription,
)
from app.models.enums import CutoutStatus, Shift, UserRole, VerificationStatus
from app.models.geo import District, Town
from app.models.marketplace import HelperProfile
from app.models.taxonomy import HelperSkill, Service, Skill
from app.models.user import User
from app.providers.registry import get_imaging, get_storage
from app.schemas.helper import (
    BrowseOut,
    ContactOut,
    HelperDetail,
    HelperMe,
    HelperProfileIn,
    PhotoOut,
)
from app.services.listings import card, load_related, search_profiles

router = APIRouter(tags=["helpers"])

MAX_PHOTO_BYTES = 8 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


# --------------------------------------------------------------------------- #
# serialisation
# --------------------------------------------------------------------------- #
async def _get_own_profile(db, user: User) -> HelperProfile:
    if user.role is not UserRole.HELPER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is a helper-only action.")
    profile = (
        await db.execute(
            select(HelperProfile)
            .options(selectinload(HelperProfile.skills))
            .where(HelperProfile.user_id == user.id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return profile


# --------------------------------------------------------------------------- #
# my profile
# --------------------------------------------------------------------------- #
@router.get("/helpers/me", response_model=HelperMe)
async def get_my_profile(user: CurrentUser, db: DbSession) -> HelperMe:
    profile = await _get_own_profile(db, user)
    service, district, town = await load_related(db, profile)
    return HelperMe(
        **card(profile, user, service, district, town),
        bio=profile.bio,
        landmark=profile.landmark,
        is_listed=profile.is_listed,
        onboarding_step=profile.onboarding_step,
        id_verification_status=profile.id_verification_status,
        police_verification_status=profile.police_verification_status,
        has_active_subscription=await has_active_subscription(db, user.id),
    )


@router.patch("/helpers/me", response_model=HelperMe)
async def update_my_profile(
    payload: HelperProfileIn, user: CurrentUser, db: DbSession
) -> HelperMe:
    """Partial update, one onboarding step at a time.

    Saving each step immediately is what makes the flow resumable: a helper who
    closes the tab at step 6 and comes back on their phone lands on step 6.
    """
    profile = await _get_own_profile(db, user)
    data = payload.model_dump(exclude_unset=True)

    if "full_name" in data and data["full_name"]:
        user.full_name = data.pop("full_name")

    if "service" in data:
        slug = data.pop("service")
        service = (
            await db.execute(select(Service).where(Service.slug == slug))
        ).scalar_one_or_none()
        if service is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown service: {slug}")
        # An archived service can be kept but not newly chosen: helpers
        # already in it stay findable, and nobody new joins a category
        # that is being wound down.
        if not service.is_active and service.id != profile.service_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{service.name} is no longer offered. Choose another service.",
            )
        profile.service_id = service.id

    if "district" in data:
        slug = data.pop("district")
        district = (
            await db.execute(select(District).where(District.slug == slug))
        ).scalar_one_or_none()
        if district is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown district: {slug}")
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

    if "skills" in data:
        slugs = data.pop("skills") or []
        rows = (
            (await db.execute(select(Skill).where(Skill.slug.in_(slugs)))).scalars().all()
        )
        if len(rows) != len(set(slugs)):
            known = {r.slug for r in rows}
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown skills: {sorted(set(slugs) - known)}",
            )
        # An archived skill may be kept but not newly chosen -- the same rule
        # services get above. Without the "already mine" half, a helper who
        # happens to re-save their profile would lose a chip to a 400.
        already = set(
            (
                await db.execute(
                    select(HelperSkill.skill_id).where(
                        HelperSkill.helper_profile_id == profile.id
                    )
                )
            )
            .scalars()
            .all()
        )
        retired = [r.name for r in rows if not r.is_active and r.id not in already]
        if retired:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"No longer offered: {', '.join(sorted(retired))}. Choose another skill.",
            )
        await db.execute(
            HelperSkill.__table__.delete().where(
                HelperSkill.helper_profile_id == profile.id
            )
        )
        for row in rows:
            db.add(HelperSkill(helper_profile_id=profile.id, skill_id=row.id))

    # Wage bounds are cross-checked against whatever is already stored, so
    # patching only one end of the range cannot produce max < min.
    new_min = data.get("wage_monthly_min", profile.wage_monthly_min)
    new_max = data.get("wage_monthly_max", profile.wage_monthly_max)
    if new_min and new_max and new_max < new_min:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Maximum wage cannot be less than the minimum.",
        )

    for field, value in data.items():
        setattr(profile, field, value)

    await db.flush()
    await db.refresh(profile, ["skills"])
    service, district, town = await load_related(db, profile)
    return HelperMe(
        **card(profile, user, service, district, town),
        bio=profile.bio,
        landmark=profile.landmark,
        is_listed=profile.is_listed,
        onboarding_step=profile.onboarding_step,
        id_verification_status=profile.id_verification_status,
        police_verification_status=profile.police_verification_status,
        has_active_subscription=await has_active_subscription(db, user.id),
    )


@router.post("/helpers/me/photo", response_model=PhotoOut)
async def upload_photo(
    user: CurrentUser, db: DbSession, file: UploadFile = File(...)
) -> PhotoOut:
    """Store the portrait and attempt a background cutout.

    A failed cutout is not an error: the card falls back to a circular crop that
    still straddles the header panel. Nobody is blocked from listing by a bad
    photo.
    """
    profile = await _get_own_profile(db, user)

    if file.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Upload a JPEG, PNG or WebP image.",
        )

    raw = await file.read()
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Keep the photo under 8 MB."
        )

    storage, imaging = get_storage(), get_imaging()

    try:
        normalized = imaging.normalize(raw)
    except Exception:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That file is not a readable image."
        ) from None

    # Every upload gets fresh keys. Reusing one path means the browser -- and
    # later a CDN -- keeps serving the previous photo from cache, so a helper
    # uploads a new portrait and still sees the old one. Only files under
    # this helper's own prefix are ever removed; the shared demo/ images
    # are referenced by many profiles and must never be deleted here.
    base = f"helpers/{profile.id}"
    version = uuid.uuid4().hex[:12]
    replaced = [
        key
        for key in (profile.photo_key, profile.photo_cutout_key)
        if key and key.startswith(f"{base}/")
    ]
    profile.photo_key = await storage.save(
        key=f"{base}/photo-{version}.png", data=normalized, content_type="image/png"
    )

    result = await imaging.cutout(raw)
    note = ""
    if result.ok and result.data:
        profile.photo_cutout_key = await storage.save(
            key=f"{base}/cutout-{version}.png", data=result.data, content_type="image/png"
        )
        profile.cutout_status = CutoutStatus.DONE
    else:
        profile.photo_cutout_key = None
        profile.cutout_status = CutoutStatus.FAILED
        note = result.reason

    await db.flush()
    # Old files go only after the new keys are saved on the row.
    for key in replaced:
        await storage.delete(key=key)
    return PhotoOut(
        photo_url=storage.url_for(key=profile.photo_key),
        cutout_url=(
            storage.url_for(key=profile.photo_cutout_key)
            if profile.photo_cutout_key
            else None
        ),
        cutout_status=profile.cutout_status,
        cutout_note=note,
    )


# --------------------------------------------------------------------------- #
# browse -- free for everyone, by design
# --------------------------------------------------------------------------- #
@router.get("/helpers", response_model=BrowseOut)
async def browse(
    db: DbSession,
    district: str | None = None,
    town: str | None = None,
    service: str | None = None,
    skills: list[str] | None = Query(default=None),
    live_in: bool | None = None,
    shift: Shift | None = None,
    wage_max: int | None = Query(default=None, description="Paise per month"),
    q: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="rating", pattern="^(rating|wage_low|wage_high|newest)$"),
    limit: int = Query(default=24, ge=1, le=60),
    offset: int = Query(default=0, ge=0),
) -> BrowseOut:
    """Public. Anyone may see the cards; only contact details are paywalled.

    Nobody is asked to pay before they have seen real inventory -- that is what
    makes a both-sides subscription survivable.
    """
    return await search_profiles(
        db,
        district=district,
        town=town,
        service=service,
        skills=skills,
        live_in=live_in,
        shift=shift,
        wage_max=wage_max,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/helpers/{helper_id}", response_model=HelperDetail)
async def helper_detail(helper_id: uuid.UUID, db: DbSession) -> HelperDetail:
    profile = (
        await db.execute(
            select(HelperProfile)
            .options(selectinload(HelperProfile.skills))
            .where(HelperProfile.id == helper_id)
        )
    ).scalar_one_or_none()
    if profile is None or not profile.is_listed or profile.admin_hidden:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")

    user = await db.get(User, profile.user_id)
    service, district, town = await load_related(db, profile)
    return HelperDetail(
        **card(profile, user, service, district, town),
        bio=profile.bio,
        landmark=profile.landmark,
        is_listed=profile.is_listed,
    )


@router.get("/helpers/{helper_id}/contact", response_model=ContactOut)
async def helper_contact(
    helper_id: uuid.UUID, viewer: MaybeUser, db: DbSession
) -> ContactOut:
    """The paywall. 402 when unsubscribed, so the client can show the plan
    rather than an error."""
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to see contact details.")
    if viewer.role not in (UserRole.HIRER, UserRole.ADMIN):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only families can view contact details."
        )
    if viewer.role is not UserRole.ADMIN and not await has_active_subscription(
        db, viewer.id
    ):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "A Sahaya membership is needed to see contact details.",
        )

    profile = await db.get(HelperProfile, helper_id)
    if profile is None or not profile.is_listed or profile.admin_hidden:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")

    helper = await db.get(User, profile.user_id)
    return ContactOut(phone=helper.phone, email=helper.email)
