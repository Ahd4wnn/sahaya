"""Tokens, hashing, and OTP generation."""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


# --------------------------------------------------------------------------- #
# hashing
# --------------------------------------------------------------------------- #
def sha256_hex(value: str) -> str:
    """Hash for refresh tokens and OTP codes.

    Plain sha256 rather than argon2 is deliberate here: these are 32-byte random
    tokens and 6-digit codes with a 10-minute TTL and a 5-attempt cap, not
    user-chosen passwords. There is no dictionary to attack, so a slow KDF would
    buy nothing and cost latency on every request that refreshes a token.
    """
    return hashlib.sha256(value.encode()).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# --------------------------------------------------------------------------- #
# OTP
# --------------------------------------------------------------------------- #
def generate_otp() -> str:
    """A zero-padded numeric code drawn from a CSPRNG."""
    upper = 10**settings.OTP_LENGTH
    return str(secrets.randbelow(upper)).zfill(settings.OTP_LENGTH)


def otp_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=settings.OTP_TTL_MINUTES)


# --------------------------------------------------------------------------- #
# JWT access tokens
# --------------------------------------------------------------------------- #
def create_access_token(*, user_id: uuid.UUID, role: str) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError on anything invalid -- expired, tampered, wrong type."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload


# --------------------------------------------------------------------------- #
# refresh tokens
# --------------------------------------------------------------------------- #
def generate_refresh_token() -> tuple[str, str]:
    """Return (raw, hash).

    The raw value goes to the client exactly once and is never persisted; only
    the hash is stored, so a database leak yields no usable sessions.
    """
    raw = secrets.token_urlsafe(48)
    return raw, sha256_hex(raw)


def refresh_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_DAYS)
