"""Helper profile and browse-card shapes."""

import uuid

from pydantic import BaseModel, Field, model_validator

from app.models.enums import CutoutStatus, Shift, VerificationStatus

#: Sanity bounds on a monthly wage, in paise. Rs 1,000 to Rs 2,00,000.
#: Wide on purpose -- the job is to catch a misplaced decimal, not to tell a
#: worker what they are allowed to ask for.
WAGE_MIN_PAISE = 100_000
WAGE_MAX_PAISE = 20_000_000


class HelperProfileIn(BaseModel):
    """Every field optional: onboarding PATCHes one step at a time."""

    full_name: str | None = Field(default=None, max_length=120)
    service: str | None = None
    skills: list[str] | None = None
    headline: str | None = Field(default=None, max_length=160)
    bio: str | None = None
    experience_years: int | None = Field(default=None, ge=0, le=60)

    wage_monthly_min: int | None = Field(default=None, ge=0)
    wage_monthly_max: int | None = Field(default=None, ge=0)

    shifts: list[Shift] | None = None
    hours_per_day: int | None = Field(default=None, ge=1, le=16)
    willing_to_live_in: bool | None = None
    languages: list[str] | None = None

    district: str | None = None
    town: str | None = None
    landmark: str | None = Field(default=None, max_length=160)

    onboarding_step: int | None = Field(default=None, ge=1, le=9)

    @model_validator(mode="after")
    def _check_wage(self):
        lo, hi = self.wage_monthly_min, self.wage_monthly_max
        if lo is not None and hi is not None:
            if hi < lo:
                raise ValueError("Maximum wage cannot be less than the minimum")
            if lo < WAGE_MIN_PAISE or hi > WAGE_MAX_PAISE:
                raise ValueError(
                    "Enter a monthly wage between Rs 1,000 and Rs 2,00,000"
                )
        return self


class SkillOut(BaseModel):
    slug: str
    name: str
    name_ml: str


class HelperCard(BaseModel):
    """Exactly what the browse card renders. No contact details -- ever."""

    id: uuid.UUID
    full_name: str
    service: str | None
    service_name: str | None
    headline: str
    skills: list[SkillOut]

    experience_years: int
    wage_monthly_min: int
    wage_monthly_max: int
    shifts: list[Shift]
    hours_per_day: int
    willing_to_live_in: bool
    languages: list[str]

    district: str | None
    district_name: str | None
    town: str | None
    town_name: str | None

    photo_url: str | None
    cutout_url: str | None
    #: The frontend switches to the circular-crop treatment on anything but
    #: `done`, so a failed segmentation degrades instead of breaking the card.
    cutout_status: CutoutStatus

    id_verified: bool
    police_verified: bool
    rating_avg: float | None
    rating_count: int


class HelperDetail(HelperCard):
    bio: str
    landmark: str
    is_listed: bool


class HelperMe(HelperDetail):
    """The helper's own view. Adds progress and verification state they need to
    see, still without exposing anything a hirer should not get."""

    onboarding_step: int
    id_verification_status: VerificationStatus
    police_verification_status: VerificationStatus
    has_active_subscription: bool


class ContactOut(BaseModel):
    """Returned only to a subscribed hirer. This is what the paywall protects."""

    phone: str | None
    email: str | None


class BrowseOut(BaseModel):
    items: list[HelperCard]
    total: int
    limit: int
    offset: int


class PhotoOut(BaseModel):
    photo_url: str | None
    cutout_url: str | None
    cutout_status: CutoutStatus
    #: Present when segmentation was refused, so the UI can suggest a better
    #: photo rather than silently showing the fallback.
    cutout_note: str = ""
