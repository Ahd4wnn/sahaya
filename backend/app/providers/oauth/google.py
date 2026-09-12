"""Google ID token verification."""

import asyncio
from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import settings


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str | None
    email_verified: bool
    full_name: str


class GoogleAuthError(Exception):
    pass


async def verify_google_id_token(token: str) -> GoogleIdentity:
    """Validate signature, audience, issuer and expiry against Google.

    google-auth performs all of those checks; passing our client id as the
    audience is what stops a token minted for some other app being replayed here.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("GOOGLE_CLIENT_ID is not configured")

    def _verify() -> dict:
        return google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )

    try:
        claims = await asyncio.to_thread(_verify)
    except Exception as exc:
        raise GoogleAuthError(f"invalid Google token: {exc}") from exc

    return GoogleIdentity(
        subject=claims["sub"],
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified")),
        full_name=claims.get("name", ""),
    )
