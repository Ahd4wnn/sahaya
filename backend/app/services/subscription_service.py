"""Razorpay subscription lifecycle.

Webhooks are the only thing that grants access. The client checkout callback is
used purely to show the user immediate feedback -- it can be spoofed, dropped,
or fired from a tab that closes.
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import razorpay
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import has_active_subscription
from app.core.config import settings
from app.models.billing import Payment, Plan, Subscription
from app.models.enums import PlanCode, SubscriptionStatus, UserRole
from app.models.marketplace import HelperProfile
from app.models.user import User

logger = logging.getLogger("sahaya.billing")


class BillingError(Exception):
    pass


def get_client() -> razorpay.Client:
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise BillingError("Razorpay keys are not configured")
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


def plan_code_for_role(role: UserRole) -> PlanCode:
    if role is UserRole.HELPER:
        return PlanCode.HELPER_MONTHLY
    if role is UserRole.HIRER:
        return PlanCode.HIRER_MONTHLY
    raise BillingError("Only helpers and families have memberships")


def _ts(value: Any) -> datetime | None:
    """Razorpay sends unix seconds, and sends null freely."""
    if not value:
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


async def sync_listing_flag(db: AsyncSession, user_id: uuid.UUID) -> None:
    """A helper is listed exactly while their membership is live.

    Lapsing hides the card. It deletes nothing -- ratings, hire history and
    profile all survive, and re-subscribing restores the listing intact.
    """
    user = await db.get(User, user_id)
    if user is None or user.role is not UserRole.HELPER:
        return
    profile = (
        await db.execute(
            select(HelperProfile).where(HelperProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        return
    profile.is_listed = await has_active_subscription(db, user_id)


async def create_subscription(db: AsyncSession, user: User) -> Subscription:
    """Create a Razorpay subscription and mirror it locally as `created`."""
    code = plan_code_for_role(user.role)
    plan = (
        await db.execute(select(Plan).where(Plan.code == code))
    ).scalar_one_or_none()
    if plan is None:
        raise BillingError(f"Plan {code} is not seeded")
    if not plan.razorpay_plan_id:
        raise BillingError(
            f"Plan {code} has no razorpay_plan_id yet. Create the plan in the "
            "Razorpay dashboard and store its id."
        )

    existing = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(
                    (
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.AUTHENTICATED,
                        SubscriptionStatus.PENDING,
                    )
                ),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    client = get_client()
    created = client.subscription.create(
        {
            # 120 months. Razorpay requires a finite count; this is effectively
            # "until cancelled" while staying inside the API contract.
            "plan_id": plan.razorpay_plan_id,
            "total_count": 120,
            "customer_notify": 1,
            "notes": {"sahaya_user_id": str(user.id), "role": user.role.value},
        }
    )

    row = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        razorpay_subscription_id=created["id"],
        status=SubscriptionStatus.CREATED,
    )
    db.add(row)
    await db.flush()
    return row


# --------------------------------------------------------------------------- #
# webhook handling
# --------------------------------------------------------------------------- #
def verify_signature(raw_body: bytes, signature: str) -> bool:
    """Verify against the RAW request bytes.

    Razorpay computes HMAC-SHA256 over exactly what it sent. Parsing the JSON
    and re-serialising changes key order and whitespace, the signature stops
    matching, and every webhook fails with an error that looks like bad
    credentials. This is the single most common way this integration breaks.
    """
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        raise BillingError("RAZORPAY_WEBHOOK_SECRET is not configured")
    try:
        razorpay.Utility().verify_webhook_signature(
            raw_body.decode("utf-8"),
            signature,
            settings.RAZORPAY_WEBHOOK_SECRET,
        )
        return True
    except Exception:
        return False


#: Razorpay event -> the status we store. Our enum mirrors theirs exactly, so
#: there is no translation layer to get wrong.
EVENT_STATUS = {
    "subscription.activated": SubscriptionStatus.ACTIVE,
    "subscription.charged": SubscriptionStatus.ACTIVE,
    "subscription.pending": SubscriptionStatus.PENDING,
    "subscription.halted": SubscriptionStatus.HALTED,
    "subscription.cancelled": SubscriptionStatus.CANCELLED,
    "subscription.completed": SubscriptionStatus.COMPLETED,
    "subscription.authenticated": SubscriptionStatus.AUTHENTICATED,
}


async def apply_event(db: AsyncSession, event_type: str, payload: dict) -> str:
    """Apply one verified webhook. Returns a short outcome for the log."""
    entity = (
        payload.get("payload", {}).get("subscription", {}).get("entity")
    )
    if not entity:
        return "no subscription entity"

    row = (
        await db.execute(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == entity["id"]
            )
        )
    ).scalar_one_or_none()
    if row is None:
        logger.warning("webhook for unknown subscription %s", entity["id"])
        return "unknown subscription"

    status = EVENT_STATUS.get(event_type)
    if status is not None:
        row.status = status

    row.current_start = _ts(entity.get("current_start")) or row.current_start
    row.current_end = _ts(entity.get("current_end")) or row.current_end
    row.charge_at = _ts(entity.get("charge_at"))
    if event_type == "subscription.cancelled":
        row.cancelled_at = datetime.now(UTC)

    # `subscription.charged` carries the payment entity for the renewal.
    payment = payload.get("payload", {}).get("payment", {}).get("entity")
    if payment and payment.get("id"):
        already = (
            await db.execute(
                select(Payment).where(Payment.razorpay_payment_id == payment["id"])
            )
        ).scalar_one_or_none()
        if already is None:
            db.add(
                Payment(
                    subscription_id=row.id,
                    razorpay_payment_id=payment["id"],
                    razorpay_invoice_id=payment.get("invoice_id"),
                    amount_paise=int(payment.get("amount") or 0),
                    status=str(payment.get("status") or ""),
                    method=str(payment.get("method") or ""),
                    captured_at=_ts(payment.get("created_at")),
                )
            )

    await db.flush()
    await sync_listing_flag(db, row.user_id)
    return f"{event_type} -> {row.status}"
