"""Helper profiles, hirer profiles, hire requests, reviews, documents."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    CutoutStatus,
    DocumentKind,
    DocumentStatus,
    HireRequestStatus,
    ReviewDirection,
    Shift,
    VerificationStatus,
)
from app.models.taxonomy import Skill


class HelperProfile(UUIDMixin, TimestampMixin, Base):
    """A domestic worker's public card and profile.

    Note what is absent: there is no wage_daily and no wage_hourly column.
    Monthly is the only rate this product supports, and the schema -- not just
    the UI -- is where that is enforced.
    """

    __tablename__ = "helper_profiles"
    __table_args__ = (
        CheckConstraint(
            "wage_monthly_max >= wage_monthly_min", name="ck_helper_wage_range"
        ),
        CheckConstraint(
            "hours_per_day BETWEEN 1 AND 16", name="ck_helper_hours_per_day"
        ),
        Index("ix_helper_location", "district_id", "town_id"),
        Index("ix_helper_listed_service", "is_listed", "service_id"),
        Index("ix_helper_wage", "wage_monthly_min", "wage_monthly_max"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL"), index=True
    )

    headline: Mapped[str] = mapped_column(String(160), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    experience_years: Mapped[int] = mapped_column(Integer, default=0)

    # --- money, in paise ---
    wage_monthly_min: Mapped[int] = mapped_column(Integer, default=0)
    wage_monthly_max: Mapped[int] = mapped_column(Integer, default=0)

    # --- availability ---
    shifts: Mapped[list[Shift]] = mapped_column(
        ARRAY(Enum(Shift, name="shift")), default=list
    )
    hours_per_day: Mapped[int] = mapped_column(Integer, default=8)
    #: Live-in work is common in Kerala and is a primary hirer filter.
    willing_to_live_in: Mapped[bool] = mapped_column(Boolean, default=False)
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)

    # --- location ---
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("districts.id", ondelete="SET NULL")
    )
    town_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("towns.id", ondelete="SET NULL")
    )
    #: Free text ("near Infopark"). Displayed, never filtered on.
    landmark: Mapped[str] = mapped_column(String(160), default="")

    # --- photo ---
    photo_key: Mapped[str | None] = mapped_column(String(255))
    photo_cutout_key: Mapped[str | None] = mapped_column(String(255))
    cutout_status: Mapped[CutoutStatus] = mapped_column(
        Enum(CutoutStatus, name="cutout_status"), default=CutoutStatus.PENDING
    )

    # --- trust ---
    id_verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.NONE,
    )
    police_verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.NONE,
    )

    #: Driven by subscription state. Lapsing hides the card but destroys nothing.
    is_listed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    #: Moderation, kept separate from `is_listed` on purpose. Subscription
    #: webhooks rewrite `is_listed` whenever a payment lands, so an admin
    #: unlisting someone through that flag would be silently undone by their
    #: next renewal. Only an admin sets or clears this one.
    admin_hidden: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )

    rating_avg: Mapped[float | None] = mapped_column(Numeric(2, 1))
    rating_count: Mapped[int] = mapped_column(Integer, default=0)

    #: Resume point, so a drop-off returns to the step they left.
    onboarding_step: Mapped[int] = mapped_column(Integer, default=1)

    skills: Mapped[list[Skill]] = relationship(
        secondary="helper_skills", lazy="selectin"
    )


class HirerProfile(UUIDMixin, TimestampMixin, Base):
    """A household. Carries a public rating too -- see DECISIONS 008."""

    __tablename__ = "hirer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    household_size: Mapped[int | None] = mapped_column(Integer)
    about: Mapped[str] = mapped_column(Text, default="")

    district_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("districts.id", ondelete="SET NULL")
    )
    town_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("towns.id", ondelete="SET NULL")
    )
    landmark: Mapped[str] = mapped_column(String(160), default="")

    rating_avg: Mapped[float | None] = mapped_column(Numeric(2, 1))
    rating_count: Mapped[int] = mapped_column(Integer, default=0)

    onboarding_step: Mapped[int] = mapped_column(Integer, default=1)


class HireRequest(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "hire_requests"
    __table_args__ = (
        Index("ix_hire_helper_status", "helper_id", "status"),
        Index("ix_hire_hirer_status", "hirer_id", "status"),
    )

    hirer_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    helper_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[HireRequestStatus] = mapped_column(
        Enum(HireRequestStatus, name="hire_request_status"),
        default=HireRequestStatus.PENDING,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Review(UUIDMixin, TimestampMixin, Base):
    """Ratings run both ways.

    UNIQUE (hire_request_id, direction) means each side reviews exactly once per
    completed engagement -- the helper rates the household and the household
    rates the helper.
    """

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("hire_request_id", "direction", name="uq_review_once_per_side"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating_range"),
    )

    hire_request_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("hire_requests.id", ondelete="CASCADE")
    )
    rater_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    ratee_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    direction: Mapped[ReviewDirection] = mapped_column(
        Enum(ReviewDirection, name="review_direction")
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")


class Document(UUIDMixin, TimestampMixin, Base):
    """The admin verification queue."""

    __tablename__ = "documents"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[DocumentKind] = mapped_column(Enum(DocumentKind, name="document_kind"))
    storage_key: Mapped[str] = mapped_column(String(255))
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"), default=DocumentStatus.PENDING
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    review_note: Mapped[str] = mapped_column(Text, default="")
