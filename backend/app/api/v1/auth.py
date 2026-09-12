"""Sign-in endpoints. Four ways in, one kind of session out."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, has_active_subscription
from app.core.config import settings
from app.core.security import generate_otp, otp_expiry, sha256_hex
from app.models.enums import AuthProvider, OtpChannel, OtpPurpose, UserRole
from app.models.marketplace import HelperProfile, HirerProfile
from app.models.user import OtpCode
from app.providers.oauth.apple import AppleAuthError, verify_apple_identity_token
from app.providers.oauth.google import GoogleAuthError, verify_google_id_token
from app.providers.registry import get_email_sender, get_llm, get_sms_sender
from app.schemas.auth import (
    AppleIn,
    EmailStartIn,
    EmailVerifyIn,
    GoogleIn,
    PhoneStartIn,
    PhoneVerifyIn,
    RefreshIn,
    SessionOut,
    StartOut,
    TokenOut,
    UserOut,
)
from app.services import auth_service
from app.services.auth_service import AuthError
from app.services.otp_service import OtpError, verify_otp

logger = logging.getLogger("sahaya.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


_AUTH_MESSAGES = {
    "role_required": "Tell us whether you are looking for work or looking to hire.",
    "email_taken": "That email is already registered. Sign in the way you did before.",
    "phone_taken": "That number is already registered. Sign in the way you did before.",
    "no_identifier": "We could not get an email or phone number from that account.",
}


def _auth_message(exc: AuthError) -> str:
    return _AUTH_MESSAGES.get(str(exc), "Could not sign you in.")



def _dev_code_visible(channel: OtpChannel, target: str) -> bool:
    """Whether to return the OTP in the API response.

    Two separate reasons to, and they are not the same thing:

    **Development.** Both conditions must hold -- we are in development AND the
    relevant provider is the console stub. Either alone is not enough: a
    staging box with real SMS must never echo codes back over HTTP.

    **The testing phase.** No SMS provider exists yet, so a code cannot reach a
    phone at all, and the app shows it on screen instead. This is an account
    takeover for every number it covers: whoever types a number is handed that
    account's code. Hence the allowlist, the warning on every use, and the
    warning at startup -- and hence it being off unless somebody turns it on.
    """
    backend = (
        settings.SMS_BACKEND if channel is OtpChannel.SMS else settings.EMAIL_BACKEND
    )
    if settings.APP_ENV == "development" and backend == "console":
        return True

    if settings.AUTH_TESTING_OTP:
        allowed = settings.testing_otp_phones
        if not allowed or target in allowed:
            logger.warning(
                "testing-phase OTP revealed over HTTP for %s (AUTH_TESTING_OTP is on)",
                target,
            )
            return True
    return False


async def _issue_and_maybe_reveal(
    db, *, target: str, channel: OtpChannel, purpose: OtpPurpose
) -> StartOut:
    """Issue an OTP, mirroring otp_service but keeping the plaintext locally so
    development can skip the log-scraping step."""
    now = datetime.now(UTC)
    outstanding = (
        await db.execute(
            select(OtpCode).where(
                OtpCode.target == target,
                OtpCode.purpose == purpose,
                OtpCode.consumed_at.is_(None),
            )
        )
    ).scalars()
    for row in outstanding:
        row.consumed_at = now

    code = generate_otp()
    db.add(
        OtpCode(
            target=target,
            channel=channel,
            purpose=purpose,
            code_hash=sha256_hex(code),
            expires_at=otp_expiry(),
        )
    )
    await db.flush()

    if channel is OtpChannel.SMS:
        await get_sms_sender().send_otp(to=target, code=code)
    else:
        await get_email_sender().send_otp(to=target, code=code)

    return StartOut(
        sent=True, dev_code=code if _dev_code_visible(channel, target) else None
    )


async def _session(db, user, *, created: bool, device: str) -> SessionOut:
    tokens = await auth_service.issue_tokens(db, user, device=device)
    step = 1
    if user.role is UserRole.HELPER:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        step = profile.onboarding_step if profile else 1
    elif user.role is UserRole.HIRER:
        profile = (
            await db.execute(
                select(HirerProfile).where(HirerProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        step = profile.onboarding_step if profile else 1

    return SessionOut(
        user=UserOut(
            id=user.id,
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            role=user.role,
            email_verified=user.is_email_verified,
            phone_verified=user.is_phone_verified,
        ),
        tokens=TokenOut(**tokens.__dict__),
        created=created,
        onboarding_step=step,
        has_active_subscription=await has_active_subscription(db, user.id),
        assistant_enabled=get_llm().available,
    )


def _device(request: Request) -> str:
    return request.headers.get("User-Agent", "")[:255]


# --------------------------------------------------------------------------- #
# phone
# --------------------------------------------------------------------------- #
@router.post("/phone/start", response_model=StartOut)
async def phone_start(payload: PhoneStartIn, db: DbSession) -> StartOut:
    return await _issue_and_maybe_reveal(
        db, target=payload.phone, channel=OtpChannel.SMS, purpose=OtpPurpose.LOGIN
    )


@router.post("/phone/verify", response_model=SessionOut)
async def phone_verify(
    payload: PhoneVerifyIn, request: Request, db: DbSession
) -> SessionOut:
    try:
        await verify_otp(
            db, target=payload.phone, purpose=OtpPurpose.LOGIN, code=payload.code
        )
    except OtpError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    try:
        user, created = await auth_service.resolve_user(
            db,
            provider=AuthProvider.PHONE,
            subject=payload.phone,
            phone=payload.phone,
            phone_verified=True,
            full_name=payload.full_name,
            role=payload.role,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, _auth_message(exc)) from None

    return await _session(db, user, created=created, device=_device(request))


# --------------------------------------------------------------------------- #
# email
# --------------------------------------------------------------------------- #
@router.post("/email/start", response_model=StartOut)
async def email_start(payload: EmailStartIn, db: DbSession) -> StartOut:
    return await _issue_and_maybe_reveal(
        db,
        target=payload.email.lower(),
        channel=OtpChannel.EMAIL,
        purpose=OtpPurpose.LOGIN,
    )


@router.post("/email/verify", response_model=SessionOut)
async def email_verify(
    payload: EmailVerifyIn, request: Request, db: DbSession
) -> SessionOut:
    email = payload.email.lower()
    try:
        await verify_otp(db, target=email, purpose=OtpPurpose.LOGIN, code=payload.code)
    except OtpError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    try:
        user, created = await auth_service.resolve_user(
            db,
            provider=AuthProvider.EMAIL,
            subject=email,
            email=email,
            email_verified=True,
            full_name=payload.full_name,
            role=payload.role,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, _auth_message(exc)) from None

    return await _session(db, user, created=created, device=_device(request))


# --------------------------------------------------------------------------- #
# google / apple
# --------------------------------------------------------------------------- #
@router.post("/google", response_model=SessionOut)
async def google_login(
    payload: GoogleIn, request: Request, db: DbSession
) -> SessionOut:
    try:
        identity = await verify_google_id_token(payload.id_token)
    except GoogleAuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None

    try:
        user, created = await auth_service.resolve_user(
            db,
            provider=AuthProvider.GOOGLE,
            subject=identity.subject,
            email=identity.email,
            email_verified=identity.email_verified,
            full_name=identity.full_name,
            role=payload.role,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, _auth_message(exc)) from None

    return await _session(db, user, created=created, device=_device(request))


@router.post("/apple", response_model=SessionOut)
async def apple_login(payload: AppleIn, request: Request, db: DbSession) -> SessionOut:
    try:
        identity = await verify_apple_identity_token(payload.identity_token)
    except AppleAuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None

    try:
        user, created = await auth_service.resolve_user(
            db,
            provider=AuthProvider.APPLE,
            subject=identity.subject,
            email=identity.email,
            email_verified=identity.email_verified,
            full_name=payload.full_name,
            role=payload.role,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, _auth_message(exc)) from None

    return await _session(db, user, created=created, device=_device(request))


# --------------------------------------------------------------------------- #
# session lifecycle
# --------------------------------------------------------------------------- #
@router.post("/refresh", response_model=TokenOut)
async def refresh(payload: RefreshIn, request: Request, db: DbSession) -> TokenOut:
    try:
        pair = await auth_service.rotate_refresh_token(
            db, raw_token=payload.refresh_token, device=_device(request)
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None
    return TokenOut(**pair.__dict__)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshIn, db: DbSession) -> None:
    await auth_service.revoke_refresh_token(db, raw_token=payload.refresh_token)


@router.get("/me", response_model=SessionOut)
async def me(user: CurrentUser, db: DbSession) -> SessionOut:
    """Current session without minting a new refresh token."""
    step = 1
    if user.role is UserRole.HELPER:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        step = profile.onboarding_step if profile else 1
    elif user.role is UserRole.HIRER:
        profile = (
            await db.execute(
                select(HirerProfile).where(HirerProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        step = profile.onboarding_step if profile else 1

    return SessionOut(
        user=UserOut(
            id=user.id,
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            role=user.role,
            email_verified=user.is_email_verified,
            phone_verified=user.is_phone_verified,
        ),
        tokens=TokenOut(access_token="", refresh_token=""),
        created=False,
        onboarding_step=step,
        has_active_subscription=await has_active_subscription(db, user.id),
        assistant_enabled=get_llm().available,
    )
