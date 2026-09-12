"""Plans, subscriptions, payments, and the webhook event log."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import PlanCode, SubscriptionStatus


class Plan(UUIDMixin, TimestampMixin, Base):
    """One row per Razorpay plan. Both are Rs 99/month."""

    __tablename__ = "plans"

    code: Mapped[PlanCode] = mapped_column(
        Enum(PlanCode, name="plan_code"), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(255), default="")
    razorpay_plan_id: Mapped[str | None] = mapped_column(String(64))
    amount_paise: Mapped[int] = mapped_column(Integer, default=9900)
    interval_unit: Mapped[str] = mapped_column(String(16), default="monthly")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Subscription(UUIDMixin, TimestampMixin, Base):
    """Mirrors a Razorpay subscription.

    Status transitions are driven exclusively by verified webhooks. The client
    checkout callback is only ever used to show the user immediate feedback --
    it never grants access, because a client callback can be spoofed, dropped,
    or fired from a tab that closes.
    """

    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT")
    )
    razorpay_subscription_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.CREATED,
    )
    current_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    charge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Payment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    razorpay_payment_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    razorpay_invoice_id: Mapped[str | None] = mapped_column(String(64))
    amount_paise: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    method: Mapped[str] = mapped_column(String(32), default="")
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEvent(UUIDMixin, TimestampMixin, Base):
    """Every Razorpay webhook we receive.

    The UNIQUE constraint on razorpay_event_id IS the idempotency guarantee.
    Razorpay retries on any non-2xx and can deliver the same event twice even on
    success, so the insert itself is the dedupe check: it either succeeds (first
    delivery, process it) or raises IntegrityError (already handled, return 200).

    A read-then-write check would leave a race window between two concurrent
    deliveries. A unique constraint does not.
    """

    __tablename__ = "webhook_events"

    razorpay_event_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str] = mapped_column(String(500), default="")
