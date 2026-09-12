"""Sign in with Apple identity token verification.

Built now so the iOS client has it waiting -- see docs/10-mobile-plan.md.
"""

from dataclasses import dataclass

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


@dataclass(frozen=True)
class AppleIdentity:
    subject: str
    email: str | None
    email_verified: bool


class AppleAuthError(Exception):
    pass


_jwk_client: PyJWKClient | None = None


def _client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        # PyJWKClient caches keys, so this is not a request-per-login.
        _jwk_client = PyJWKClient(APPLE_JWKS_URL, cache_keys=True)
    return _jwk_client


async def verify_apple_identity_token(token: str) -> AppleIdentity:
    if not settings.APPLE_CLIENT_ID:
        raise AppleAuthError("APPLE_CLIENT_ID is not configured")
    try:
        signing_key = _client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.APPLE_CLIENT_ID,
            issuer=APPLE_ISSUER,
        )
    except Exception as exc:
        raise AppleAuthError(f"invalid Apple token: {exc}") from exc

    # Apple private-relay addresses are real addresses and must be accepted.
    return AppleIdentity(
        subject=claims["sub"],
        email=claims.get("email"),
        email_verified=str(claims.get("email_verified", "false")).lower() == "true",
    )
