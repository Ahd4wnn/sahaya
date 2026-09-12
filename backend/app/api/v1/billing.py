"""Membership endpoints and the Razorpay webhook."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession, has_active_subscription
from app.core.config import settings
from app.models.billing import Plan, Subscription, WebhookEvent
from app.models.enums import SubscriptionStatus
from app.services import subscription_service
from app.services.subscription_service import BillingError

logger = logging.getLogger("sahaya.billing")
router = APIRouter(tags=["billing"])


class PlanOut(BaseModel):
    code: str
    name: str
    description: str
    amount_paise: int
    interval_unit: str


class SubscriptionOut(BaseModel):
    status: SubscriptionStatus | None = None
    current_end: datetime | None = None
    is_active: bool = False
    razorpay_subscription_id: str | None = None
    razorpay_key_id: str | None = None
    #: Set once renewal is switched off. Access continues to current_end.
    cancelled_at: datetime | None = None


@router.get("/billing/plans", response_model=list[PlanOut])
async def plans(db: DbSession) -> list[PlanOut]:
    rows = (
        (await db.execute(select(Plan).where(Plan.is_active.is_(True)))).scalars().all()
    )
    return [
        PlanOut(
            code=p.code.value,
            name=p.name,
            description=p.description,
            amount_paise=p.amount_paise,
            interval_unit=p.interval_unit,
        )
        for p in rows
    ]


@router.get("/billing/me", response_model=SubscriptionOut)
async def my_subscription(user: CurrentUser, db: DbSession) -> SubscriptionOut:
    row = (
        await db.execute(
            select(Subscription)
            .where(Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return SubscriptionOut()
    return SubscriptionOut(
        status=row.status,
        current_end=row.current_end,
        is_active=await has_active_subscription(db, user.id),
        razorpay_subscription_id=row.razorpay_subscription_id,
        cancelled_at=row.cancelled_at,
    )


@router.post("/billing/subscribe", response_model=SubscriptionOut)
async def subscribe(user: CurrentUser, db: DbSession) -> SubscriptionOut:
    """Create the Razorpay subscription and hand the client what Checkout needs.

    The subscription is `created` here, not active. Access begins only when the
    `subscription.activated` webhook arrives.
    """
    try:
        row = await subscription_service.create_subscription(db, user)
    except BillingError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None

    return SubscriptionOut(
        status=row.status,
        current_end=row.current_end,
        is_active=await has_active_subscription(db, user.id),
        razorpay_subscription_id=row.razorpay_subscription_id,
        razorpay_key_id=settings.RAZORPAY_KEY_ID or None,
    )


@router.post("/billing/cancel", response_model=SubscriptionOut)
async def cancel_my_subscription(user: CurrentUser, db: DbSession) -> SubscriptionOut:
    """Stop renewing. Access continues to the end of the period already paid.

    Cancelling is not a refund, and cutting someone off mid-month for days
    they have paid for would be wrong -- so this switches off the next charge
    and nothing else. Razorpay's own `subscription.cancelled` webhook moves
    the status when the period actually ends.
    """
    row = (
        await db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user.id,
                Subscription.status.in_(
                    (
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.AUTHENTICATED,
                        SubscriptionStatus.PENDING,
                    )
                ),
            )
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "You do not have a membership to cancel."
        )

    if row.cancelled_at is None:
        razorpay_id = row.razorpay_subscription_id
        if razorpay_id and not razorpay_id.startswith("sub_demo") and settings.RAZORPAY_KEY_ID:
            # Razorpay first: marking it cancelled here while Razorpay keeps
            # charging is the one outcome that must never happen.
            try:
                subscription_service.get_client().subscription.cancel(
                    razorpay_id, {"cancel_at_cycle_end": 1}
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    "Razorpay did not confirm the cancellation, so nothing was "
                    f"changed: {exc}",
                ) from None
        row.cancelled_at = datetime.now(UTC)
        await db.flush()

    return SubscriptionOut(
        status=row.status,
        current_end=row.current_end,
        is_active=await has_active_subscription(db, user.id),
        razorpay_subscription_id=row.razorpay_subscription_id,
        cancelled_at=row.cancelled_at,
    )


@router.post("/webhooks/razorpay", include_in_schema=True)
async def razorpay_webhook(request: Request, db: DbSession) -> dict[str, str]:
    """The source of truth for subscription state.

    Two things carry the correctness here:

    1. The signature is checked against the RAW body, read before any parsing.
    2. Idempotency is the UNIQUE constraint on razorpay_event_id -- the insert
       IS the dedupe check, so two concurrent deliveries of the same event
       cannot both be processed. A read-then-write check would leave a race.
    """
    raw = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    try:
        valid = subscription_service.verify_signature(raw, signature)
    except BillingError as exc:
        logger.error("webhook rejected: %s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None

    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature")

    import json

    body = json.loads(raw)
    event_type = body.get("event", "")
    event_id = request.headers.get("x-razorpay-event-id") or body.get("id") or ""
    if not event_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing event id")

    record = WebhookEvent(
        razorpay_event_id=event_id, event_type=event_type, payload=body
    )
    db.add(record)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # Already handled. Razorpay retries on non-2xx, so answer 200.
        return {"status": "duplicate"}

    try:
        outcome = await subscription_service.apply_event(db, event_type, body)
        record.processed_at = datetime.now(UTC)
        logger.info("webhook %s: %s", event_id, outcome)
    except Exception as exc:  # noqa: BLE001
        # Keep the event row so the failure is visible and replayable, but do
        # not pretend it succeeded.
        record.error = str(exc)[:500]
        await db.commit()
        logger.exception("webhook %s failed", event_id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Webhook processing failed"
        ) from exc

    return {"status": "ok"}
