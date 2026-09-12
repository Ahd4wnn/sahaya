"""The two properties that make the Razorpay webhook trustworthy."""

import hashlib
import hmac
import json
import time
import uuid

import pytest
from sqlalchemy import delete, select

from app.core.config import settings
from app.models.billing import Plan, Subscription, WebhookEvent
from app.models.enums import PlanCode, SubscriptionStatus, UserRole
from app.models.user import User

pytestmark = pytest.mark.asyncio


def sign(body: bytes) -> str:
    return hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()


def _event(sub_id: str, event_type="subscription.activated", start=None, end=None):
    """Periods are relative to now. Hardcoded epochs silently expire, which
    makes an access check look broken when it is actually correct."""
    now = int(time.time())
    start = start if start is not None else now - 86400
    end = end if end is not None else now + 30 * 86400
    return {
        "event": event_type,
        "payload": {
            "subscription": {
                "entity": {
                    "id": sub_id,
                    "status": "active",
                    "current_start": start,
                    "current_end": end,
                    "charge_at": end,
                }
            }
        },
    }


async def test_tampered_body_is_rejected(db, client):
    body = json.dumps(_event("sub_tamper")).encode()
    signature = sign(body)
    tampered = body.replace(b"sub_tamper", b"sub_hacked")
    if True:
        c = client
        r = await c.post(
            "/api/v1/webhooks/razorpay",
            content=tampered,
            headers={"x-razorpay-signature": signature, "x-razorpay-event-id": "evt_x"},
        )
    assert r.status_code == 400


async def test_activation_grants_access_and_lists_the_helper(db, clean_user, client):
    phone = "+919" + str(uuid.uuid4().int)[:9]
    await clean_user(phone)

    from app.services import auth_service
    from app.models.enums import AuthProvider

    user, _ = await auth_service.resolve_user(
        db, provider=AuthProvider.PHONE, subject=phone, phone=phone,
        phone_verified=True, role=UserRole.HELPER,
    )
    plan = (await db.execute(select(Plan).where(Plan.code == PlanCode.HELPER_MONTHLY))).scalar_one()
    sub_id = f"sub_test_{uuid.uuid4().hex[:10]}"
    db.add(Subscription(user_id=user.id, plan_id=plan.id,
                        razorpay_subscription_id=sub_id, status=SubscriptionStatus.CREATED))
    await db.commit()

    event_id = f"evt_{uuid.uuid4().hex[:10]}"
    body = json.dumps(_event(sub_id)).encode()
    if True:
        c = client
        headers = {"x-razorpay-signature": sign(body), "x-razorpay-event-id": event_id}
        first = await c.post("/api/v1/webhooks/razorpay", content=body, headers=headers)
        second = await c.post("/api/v1/webhooks/razorpay", content=body, headers=headers)

    assert first.status_code == 200 and first.json()["status"] == "ok"
    # Redelivery must be a no-op that still answers 200, or Razorpay retries forever.
    assert second.status_code == 200 and second.json()["status"] == "duplicate"

    from app.api.deps import has_active_subscription
    from app.models.marketplace import HelperProfile

    await db.commit()
    assert await has_active_subscription(db, user.id) is True

    profile = (await db.execute(
        select(HelperProfile).where(HelperProfile.user_id == user.id)
    )).scalar_one()
    await db.refresh(profile)
    assert profile.is_listed is True, "an active membership must list the helper"

    # cleanup
    await db.execute(delete(WebhookEvent).where(WebhookEvent.razorpay_event_id == event_id))
    await db.execute(delete(Subscription).where(Subscription.razorpay_subscription_id == sub_id))
    await db.commit()


async def test_halted_membership_delists_the_helper(db, clean_user, client):
    phone = "+919" + str(uuid.uuid4().int)[:9]
    await clean_user(phone)

    from app.services import auth_service
    from app.models.enums import AuthProvider
    from app.models.marketplace import HelperProfile

    user, _ = await auth_service.resolve_user(
        db, provider=AuthProvider.PHONE, subject=phone, phone=phone,
        phone_verified=True, role=UserRole.HELPER,
    )
    plan = (await db.execute(select(Plan).where(Plan.code == PlanCode.HELPER_MONTHLY))).scalar_one()
    sub_id = f"sub_halt_{uuid.uuid4().hex[:10]}"
    db.add(Subscription(user_id=user.id, plan_id=plan.id,
                        razorpay_subscription_id=sub_id, status=SubscriptionStatus.CREATED))
    await db.commit()

    if True:
        c = client
        for etype, eid in [("subscription.activated", f"evt_{uuid.uuid4().hex[:10]}"),
                           ("subscription.halted",    f"evt_{uuid.uuid4().hex[:10]}")]:
            body = json.dumps(_event(sub_id, etype)).encode()
            r = await c.post("/api/v1/webhooks/razorpay", content=body,
                             headers={"x-razorpay-signature": sign(body), "x-razorpay-event-id": eid})
            assert r.status_code == 200
            if etype == "subscription.activated":
                await db.commit()
                listed = (await db.execute(
                    select(HelperProfile).where(HelperProfile.user_id == user.id)
                )).scalar_one()
                await db.refresh(listed)
                assert listed.is_listed is True, "activation must list first"

    await db.commit()
    profile = (await db.execute(
        select(HelperProfile).where(HelperProfile.user_id == user.id)
    )).scalar_one()
    await db.refresh(profile)
    assert profile.is_listed is False, "a halted membership must hide the card"

    await db.execute(delete(Subscription).where(Subscription.razorpay_subscription_id == sub_id))
    await db.commit()
