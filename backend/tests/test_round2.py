"""The properties round 2 depends on, pinned down.

Each test builds its own people directly, so a failure points at the property
under test rather than at signup.

Note on reading back: the API writes through its own session, so these tests
re-read with `await db.refresh(obj)`. Never `db.expire_all()` followed by
attribute access -- an expired attribute lazy-loads synchronously, which an
async session refuses with MissingGreenlet.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, update

from app.models.billing import Plan, Subscription
from app.models.engagement import Notification
from app.models.enums import (
    DocumentStatus,
    PlanCode,
    SubscriptionStatus,
    UserRole,
    VerificationStatus,
)
from app.models.marketplace import Document, HelperProfile
from app.models.taxonomy import Service
from app.models.user import AdminAction, User
from app.providers.registry import get_storage
from app.services import auth_service
from tests.conftest import unique_phone

pytestmark = pytest.mark.asyncio


async def subscribe(db, user: User) -> None:
    code = PlanCode.HELPER_MONTHLY if user.role is UserRole.HELPER else PlanCode.HIRER_MONTHLY
    plan = (await db.execute(select(Plan).where(Plan.code == code))).scalar_one()
    now = datetime.now(UTC)
    db.add(
        Subscription(
            user_id=user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_start=now - timedelta(days=1),
            current_end=now + timedelta(days=29),
        )
    )


async def person(db, clean_user, role: UserRole, *, subscribed=False, name="Test Person"):
    """A user, their helper profile if they are one, and auth headers."""
    phone = unique_phone()
    await clean_user(phone)
    user = User(phone=phone, full_name=name, role=role, phone_verified_at=datetime.now(UTC))
    db.add(user)
    await db.flush()

    profile = None
    if role is UserRole.HELPER:
        profile = HelperProfile(user_id=user.id, is_listed=subscribed)
        db.add(profile)
    if subscribed:
        await subscribe(db, user)

    tokens = await auth_service.issue_tokens(db, user)
    await db.commit()
    return user, profile, {"Authorization": f"Bearer {tokens.access_token}"}


# --------------------------------------------------------------------------- #
# messaging
# --------------------------------------------------------------------------- #
async def test_messaging_needs_a_membership_on_both_sides(db, clean_user, client):
    hirer, _, as_hirer = await person(db, clean_user, UserRole.HIRER, name="Asha Hirer")
    helper, profile, as_helper = await person(
        db, clean_user, UserRole.HELPER, subscribed=True, name="Bindu Helper"
    )

    # An unsubscribed family is sent to the paywall, not shown an error.
    r = await client.post(
        "/api/v1/conversations", json={"helper_profile_id": str(profile.id)}, headers=as_hirer
    )
    assert r.status_code == 402

    await subscribe(db, hirer)
    await db.commit()
    r = await client.post(
        "/api/v1/conversations", json={"helper_profile_id": str(profile.id)}, headers=as_hirer
    )
    assert r.status_code == 200
    convo = r.json()
    assert convo["can_send"] is True

    r = await client.post(
        f"/api/v1/conversations/{convo['id']}/messages",
        json={"body": "Hello, are you free from Monday?"},
        headers=as_hirer,
    )
    assert r.status_code == 201

    # The helper's membership lapses: the family can no longer send, and gets a
    # 409 -- not a 402, because it is not something they can pay to fix.
    await db.execute(
        update(Subscription)
        .where(Subscription.user_id == helper.id)
        .values(current_end=datetime.now(UTC) - timedelta(minutes=1))
    )
    await db.commit()
    r = await client.post(
        f"/api/v1/conversations/{convo['id']}/messages",
        json={"body": "Hello again"},
        headers=as_hirer,
    )
    assert r.status_code == 409

    # Reading is never gated: the lapsed helper still sees the thread, unread.
    r = await client.get("/api/v1/me/conversations", headers=as_helper)
    assert r.status_code == 200
    [theirs] = r.json()
    assert theirs["unread"] == 1
    assert theirs["blocked_reason"] == "you_need_membership"


async def test_a_pair_of_people_has_exactly_one_conversation(db, clean_user, client):
    hirer, _, as_hirer = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    _, profile, as_helper = await person(db, clean_user, UserRole.HELPER, subscribed=True)

    first = await client.post(
        "/api/v1/conversations", json={"helper_profile_id": str(profile.id)}, headers=as_hirer
    )
    again = await client.post(
        "/api/v1/conversations", json={"helper_profile_id": str(profile.id)}, headers=as_hirer
    )
    from_helper = await client.post(
        "/api/v1/conversations", json={"user_id": str(hirer.id)}, headers=as_helper
    )
    assert first.status_code == again.status_code == from_helper.status_code == 200
    assert first.json()["id"] == again.json()["id"] == from_helper.json()["id"]


async def test_the_sender_sees_when_their_message_was_read(db, clean_user, client):
    _, _, as_hirer = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    _, profile, as_helper = await person(db, clean_user, UserRole.HELPER, subscribed=True)

    convo = (
        await client.post(
            "/api/v1/conversations", json={"helper_profile_id": str(profile.id)}, headers=as_hirer
        )
    ).json()
    assert convo["other_read_at"] is None

    await client.post(
        f"/api/v1/conversations/{convo['id']}/messages", json={"body": "Hi"}, headers=as_hirer
    )
    r = await client.post(f"/api/v1/conversations/{convo['id']}/read", headers=as_helper)
    assert r.status_code == 204

    [mine] = (await client.get("/api/v1/me/conversations", headers=as_hirer)).json()
    assert mine["other_read_at"] is not None


# --------------------------------------------------------------------------- #
# hires and reviews
# --------------------------------------------------------------------------- #
async def test_hire_state_machine_and_reviews_run_both_ways(db, clean_user, client):
    _, _, as_hirer = await person(db, clean_user, UserRole.HIRER, subscribed=True, name="Chitra Nair")
    _, profile, as_helper = await person(db, clean_user, UserRole.HELPER, subscribed=True)

    r = await client.post(
        f"/api/v1/helpers/{profile.id}/hire", json={"message": "Weekday mornings"}, headers=as_hirer
    )
    assert r.status_code == 201
    hire_id = r.json()["id"]

    # Only the helper can accept.
    r = await client.patch(f"/api/v1/hires/{hire_id}", json={"action": "accept"}, headers=as_hirer)
    assert r.status_code == 403
    r = await client.patch(f"/api/v1/hires/{hire_id}", json={"action": "accept"}, headers=as_helper)
    assert r.status_code == 200 and r.json()["status"] == "accepted"

    # No reviewing unfinished work.
    r = await client.post(f"/api/v1/hires/{hire_id}/review", json={"rating": 4}, headers=as_hirer)
    assert r.status_code == 409

    r = await client.patch(f"/api/v1/hires/{hire_id}", json={"action": "complete"}, headers=as_hirer)
    assert r.status_code == 200

    r = await client.post(
        f"/api/v1/hires/{hire_id}/review",
        json={"rating": 4, "comment": "Reliable."},
        headers=as_hirer,
    )
    assert r.status_code == 201
    assert r.json()["rater_name"] == "Chitra N."

    # Once per side.
    r = await client.post(f"/api/v1/hires/{hire_id}/review", json={"rating": 5}, headers=as_hirer)
    assert r.status_code == 409

    # The helper can still review the family -- the other direction.
    r = await client.post(f"/api/v1/hires/{hire_id}/review", json={"rating": 5}, headers=as_helper)
    assert r.status_code == 201

    await db.refresh(profile)
    assert float(profile.rating_avg) == 4.0
    assert profile.rating_count == 1

    r = await client.get(f"/api/v1/helpers/{profile.id}/reviews")
    assert [x["rating"] for x in r.json()] == [4]


# --------------------------------------------------------------------------- #
# admin
# --------------------------------------------------------------------------- #
async def test_admin_routes_refuse_everyone_else(db, clean_user, client):
    _, _, as_hirer = await person(db, clean_user, UserRole.HIRER)
    r = await client.get("/api/v1/admin/stats", headers=as_hirer)
    assert r.status_code == 403


async def test_archived_services_leave_the_front_page_and_every_change_is_audited(
    db, clean_user, client
):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    slug = f"test_{uuid.uuid4().hex[:8]}"
    try:
        r = await client.post(
            "/api/v1/admin/services",
            json={"slug": slug, "name": "Test Service", "icon": "broom", "show_in_nav": True},
            headers=as_admin,
        )
        assert r.status_code == 201
        service_id = r.json()["id"]

        taxonomy = (await client.get("/api/v1/taxonomy")).json()
        [shown] = [s for s in taxonomy["services"] if s["slug"] == slug]
        assert shown["show_in_nav"] is True
        assert shown["nav_label"] == "Test Service"  # falls back to the name

        # The slug is immutable, and saying so beats silently ignoring it.
        r = await client.patch(
            f"/api/v1/admin/services/{service_id}", json={"slug": "renamed"}, headers=as_admin
        )
        assert r.status_code == 422
        r = await client.patch(
            f"/api/v1/admin/services/{service_id}", json={"icon": "not-a-real-icon"}, headers=as_admin
        )
        assert r.status_code == 422

        r = await client.patch(
            f"/api/v1/admin/services/{service_id}", json={"is_active": False}, headers=as_admin
        )
        assert r.status_code == 200

        taxonomy = (await client.get("/api/v1/taxonomy")).json()
        assert slug not in {s["slug"] for s in taxonomy["services"]}
        admin_list = (await client.get("/api/v1/admin/services", headers=as_admin)).json()
        assert slug in {s["slug"] for s in admin_list}

        actions = (
            await db.execute(
                select(AdminAction.action).where(AdminAction.target_id == uuid.UUID(service_id))
            )
        ).scalars().all()
        assert set(actions) == {"service.create", "service.archive"}
    finally:
        await db.execute(delete(Service).where(Service.slug == slug))
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()


async def test_suspension_ends_every_session(db, clean_user, client):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    hirer, _, as_hirer = await person(db, clean_user, UserRole.HIRER)
    try:
        assert (await client.get("/api/v1/auth/me", headers=as_hirer)).status_code == 200
        r = await client.patch(
            f"/api/v1/admin/users/{hirer.id}",
            json={"status": "suspended", "note": "test"},
            headers=as_admin,
        )
        assert r.status_code == 200
        assert (await client.get("/api/v1/auth/me", headers=as_hirer)).status_code == 401
    finally:
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()


# --------------------------------------------------------------------------- #
# membership
# --------------------------------------------------------------------------- #
async def test_cancelling_keeps_access_to_the_end_of_the_paid_period(db, clean_user, client):
    _, _, as_hirer = await person(db, clean_user, UserRole.HIRER, subscribed=True)

    r = await client.post("/api/v1/billing/cancel", headers=as_hirer)
    assert r.status_code == 200
    body = r.json()
    assert body["cancelled_at"] is not None
    # Cancelling stops the renewal; it does not take back days already paid for.
    assert body["is_active"] is True


# --------------------------------------------------------------------------- #
# verification documents
# --------------------------------------------------------------------------- #
async def test_id_documents_are_never_publicly_served(db, clean_user, client):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    helper, profile, as_helper = await person(db, clean_user, UserRole.HELPER, subscribed=True)
    content = b"\x89PNG\r\n\x1a\n" + b"not really an id" * 8
    key = None
    try:
        r = await client.post(
            "/api/v1/me/documents",
            data={"kind": "id_proof"},
            files={"file": ("aadhaar.png", content, "image/png")},
            headers=as_helper,
        )
        assert r.status_code == 201
        doc_id = r.json()["id"]
        key = (
            await db.execute(select(Document.storage_key).where(Document.id == uuid.UUID(doc_id)))
        ).scalar_one()
        assert key.startswith("private/")

        # Not through the public mount -- including by case trickery, since
        # Windows filesystems are case-insensitive.
        assert (await client.get(f"/media/{key}")).status_code == 404
        assert (await client.get(f"/media/{key.replace('private', 'PRIVATE', 1)}")).status_code == 404

        # Only through the admin endpoint.
        r = await client.get(f"/api/v1/admin/documents/{doc_id}/file", headers=as_helper)
        assert r.status_code == 403
        r = await client.get(f"/api/v1/admin/documents/{doc_id}/file", headers=as_admin)
        assert r.status_code == 200 and r.content == content

        await db.refresh(profile)
        assert profile.id_verification_status is VerificationStatus.PENDING

        # A rejection needs a reason; an approval flips the badge and tells them.
        r = await client.patch(
            f"/api/v1/admin/documents/{doc_id}", json={"decision": "reject"}, headers=as_admin
        )
        assert r.status_code == 422
        r = await client.patch(
            f"/api/v1/admin/documents/{doc_id}", json={"decision": "approve"}, headers=as_admin
        )
        assert r.status_code == 200 and r.json()["status"] == DocumentStatus.APPROVED.value

        await db.refresh(profile)
        assert profile.id_verification_status is VerificationStatus.VERIFIED
        told = (
            await db.execute(
                select(Notification).where(
                    Notification.user_id == helper.id, Notification.kind == "verification"
                )
            )
        ).scalars().all()
        assert len(told) == 1
    finally:
        if key:
            await get_storage().delete(key=key)
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()
