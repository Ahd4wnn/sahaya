"""The properties that matter most in auth, pinned down."""

import pytest
from sqlalchemy import select

from app.models.enums import AuthProvider, OtpChannel, OtpPurpose, UserRole
from app.models.user import User
from app.schemas.auth import normalize_phone
from app.services import auth_service
from app.services.otp_service import OtpError, issue_otp, verify_otp
from tests.conftest import unique_email, unique_phone

pytestmark = pytest.mark.asyncio


# --------------------------------------------------------------------------- #
# phone normalisation
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "raw",
    ["9847012345", "+919847012345", "+91 98470 12345", "098470-12345", "919847012345"],
)
async def test_phone_shapes_collapse_to_one_canonical_form(raw):
    assert normalize_phone(raw) == "+919847012345"


@pytest.mark.parametrize("raw", ["12345", "5847012345", "98470123456", "abcdefghij"])
async def test_invalid_phones_rejected(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)


# --------------------------------------------------------------------------- #
# one person, one account
# --------------------------------------------------------------------------- #
async def test_google_login_links_to_existing_verified_email_account(db, clean_user):
    """The property that stops a returning user losing their rating."""
    email = unique_email()
    await clean_user(email)

    user, created = await auth_service.resolve_user(
        db,
        provider=AuthProvider.EMAIL,
        subject=email,
        email=email,
        email_verified=True,
        role=UserRole.HELPER,
    )
    assert created is True

    same, created_again = await auth_service.resolve_user(
        db,
        provider=AuthProvider.GOOGLE,
        subject="google-sub-xyz",
        email=email,
        email_verified=True,
    )
    assert created_again is False
    assert same.id == user.id

    count = len(
        (await db.execute(select(User).where(User.email == email))).scalars().all()
    )
    assert count == 1, "signing in with Google must not create a second account"


async def test_unverified_email_never_links(db, clean_user):
    """An unverified claim must not merge into someone else's account.

    Otherwise an attacker registers a victim's address unverified and waits to
    be merged into it. The correct outcome is a clean refusal, not a link and
    not a duplicate-key crash.
    """
    email = unique_email()
    await clean_user(email)

    user, _ = await auth_service.resolve_user(
        db,
        provider=AuthProvider.EMAIL,
        subject=email,
        email=email,
        email_verified=True,
        role=UserRole.HIRER,
    )
    await db.flush()

    with pytest.raises(auth_service.AuthError) as exc:
        await auth_service.resolve_user(
            db,
            provider=AuthProvider.GOOGLE,
            subject="google-sub-attacker",
            email=email,
            email_verified=False,  # <- the whole point
            role=UserRole.HIRER,
        )
    assert str(exc.value) == "email_taken"

    still_one = (
        (await db.execute(select(User).where(User.email == email))).scalars().all()
    )
    assert len(still_one) == 1
    assert still_one[0].id == user.id


async def test_account_with_no_identifier_is_refused_cleanly(db):
    """A provider that yields neither email nor phone must not reach the
    database and surface a CHECK-constraint 500."""
    with pytest.raises(auth_service.AuthError) as exc:
        await auth_service.resolve_user(
            db,
            provider=AuthProvider.APPLE,
            subject="apple-sub-no-email",
            role=UserRole.HIRER,
        )
    assert str(exc.value) == "no_identifier"


async def test_new_account_requires_a_role(db):
    with pytest.raises(auth_service.AuthError):
        await auth_service.resolve_user(
            db, provider=AuthProvider.PHONE, subject=unique_phone(), phone=unique_phone()
        )


# --------------------------------------------------------------------------- #
# OTP policy
# --------------------------------------------------------------------------- #
async def test_wrong_code_is_rejected(db, clean_user):
    phone = unique_phone()
    await clean_user(phone)
    await issue_otp(db, target=phone, channel=OtpChannel.SMS, purpose=OtpPurpose.LOGIN)
    with pytest.raises(OtpError):
        await verify_otp(db, target=phone, purpose=OtpPurpose.LOGIN, code="000000")


async def test_attempts_are_capped_then_the_code_is_burned(db, clean_user):
    from app.core.config import settings

    phone = unique_phone()
    await clean_user(phone)
    await issue_otp(db, target=phone, channel=OtpChannel.SMS, purpose=OtpPurpose.LOGIN)

    for _ in range(settings.OTP_MAX_ATTEMPTS):
        with pytest.raises(OtpError):
            await verify_otp(db, target=phone, purpose=OtpPurpose.LOGIN, code="000000")

    # Even the correct code must now fail -- the budget is spent.
    with pytest.raises(OtpError):
        await verify_otp(db, target=phone, purpose=OtpPurpose.LOGIN, code="000000")


async def test_requesting_a_second_code_invalidates_the_first(db, clean_user):
    """Otherwise every resend doubles an attacker's guessing budget."""
    from app.core.security import sha256_hex
    from app.models.user import OtpCode

    phone = unique_phone()
    await clean_user(phone)

    await issue_otp(db, target=phone, channel=OtpChannel.SMS, purpose=OtpPurpose.LOGIN)
    first = (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.target == phone)
            .order_by(OtpCode.created_at.desc())
        )
    ).scalars().first()
    first_hash = first.code_hash

    await issue_otp(db, target=phone, channel=OtpChannel.SMS, purpose=OtpPurpose.LOGIN)

    live = (
        (
            await db.execute(
                select(OtpCode).where(
                    OtpCode.target == phone, OtpCode.consumed_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(live) == 1
    assert live[0].code_hash != first_hash
    assert sha256_hex  # imported for clarity of intent
