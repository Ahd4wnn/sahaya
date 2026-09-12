"""Issuing and verifying one-time codes."""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import constant_time_equals, generate_otp, otp_expiry, sha256_hex
from app.models.enums import OtpChannel, OtpPurpose
from app.models.user import OtpCode
from app.providers.registry import get_email_sender, get_sms_sender

logger = logging.getLogger("sahaya.otp")


class OtpError(Exception):
    """Raised when a code is wrong, expired, used, or out of attempts."""


async def issue_otp(
    db: AsyncSession, *, target: str, channel: OtpChannel, purpose: OtpPurpose
) -> None:
    """Create a code and dispatch it.

    Any outstanding codes for the same target and purpose are consumed first, so
    only the newest code can ever be used. Without that, requesting a second code
    would leave the first one live and double an attacker's guessing budget.
    """
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


async def verify_otp(
    db: AsyncSession, *, target: str, purpose: OtpPurpose, code: str
) -> None:
    """Consume a code, or raise OtpError.

    Every failure path raises the same generic message. Telling the caller
    whether a code was wrong versus expired versus never issued would confirm
    which phone numbers and emails are registered.
    """
    now = datetime.now(UTC)

    row = (
        await db.execute(
            select(OtpCode)
            .where(
                OtpCode.target == target,
                OtpCode.purpose == purpose,
                OtpCode.consumed_at.is_(None),
            )
            .order_by(OtpCode.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if row is None:
        raise OtpError("That code is not valid. Request a new one.")

    if row.expires_at < now:
        row.consumed_at = now
        raise OtpError("That code is not valid. Request a new one.")

    if row.attempts >= settings.OTP_MAX_ATTEMPTS:
        row.consumed_at = now
        raise OtpError("That code is not valid. Request a new one.")

    row.attempts += 1

    if not constant_time_equals(row.code_hash, sha256_hex(code)):
        # Burn the code once the budget is spent, so guessing cannot continue.
        if row.attempts >= settings.OTP_MAX_ATTEMPTS:
            row.consumed_at = now
        await db.flush()
        raise OtpError("That code is not valid. Request a new one.")

    row.consumed_at = now
    await db.flush()
