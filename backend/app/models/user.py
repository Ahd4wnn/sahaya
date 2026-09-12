"""Identity: users, linked provider identities, refresh tokens, OTP codes."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    AuthProvider,
    OtpChannel,
    OtpPurpose,
    UserRole,
    UserStatus,
)


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "email IS NOT NULL OR phone IS NOT NULL",
            name="ck_users_email_or_phone",
        ),
    )

    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"))
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status"), default=UserStatus.ACTIVE
    )

    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    #: Which notification categories this person wants. Stored sparse: a
    #: missing key means the default in app/services/notify.py, so adding a
    #: category later needs no backfill. A column, not a table, because
    #: nothing ever queries across people's preferences.
    notification_prefs: Mapped[dict[str, bool]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )

    identities: Mapped[list["AuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def is_phone_verified(self) -> bool:
        return self.phone_verified_at is not None


class AuthIdentity(UUIDMixin, TimestampMixin, Base):
    """One row per sign-in method linked to a user.

    The unique constraint on (provider, provider_subject) is what makes one
    person one account: someone who signs up by phone and later taps "Continue
    with Google" gets a second row here and the SAME users row, so their hire
    history and hard-earned rating stay intact.
    """

    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_identity_provider_subject"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[AuthProvider] = mapped_column(Enum(AuthProvider, name="auth_provider"))
    provider_subject: Mapped[str] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="identities")


class RefreshToken(UUIDMixin, TimestampMixin, Base):
    """Rotating refresh tokens, stored hashed.

    Only the sha256 hash is persisted, so a database leak yields no usable
    sessions. On refresh the old row gets `replaced_by` set; if a token that is
    already replaced is presented again that is replay, and the whole chain is
    revoked.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device: Mapped[str] = mapped_column(String(255), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))


class OtpCode(UUIDMixin, TimestampMixin, Base):
    """Six-digit codes, hashed at rest, single use, attempt-capped."""

    __tablename__ = "otp_codes"
    __table_args__ = (Index("ix_otp_target_purpose", "target", "purpose"),)

    target: Mapped[str] = mapped_column(String(320))
    channel: Mapped[OtpChannel] = mapped_column(Enum(OtpChannel, name="otp_channel"))
    purpose: Mapped[OtpPurpose] = mapped_column(Enum(OtpPurpose, name="otp_purpose"))
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminAction(UUIDMixin, TimestampMixin, Base):
    """Append-only audit log of everything an admin does."""

    __tablename__ = "admin_actions"

    admin_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    note: Mapped[str] = mapped_column(Text, default="")
