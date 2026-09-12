"""Account resolution and token issuance.

Every sign-in method converges here. Google, Apple, phone and email are only
ways of *proving* an identifier; what comes out is always a Sahaya token pair.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_refresh_token,
    refresh_expiry,
    sha256_hex,
)
from app.models.enums import AuthProvider, UserRole, UserStatus
from app.models.marketplace import HelperProfile, HirerProfile
from app.models.user import AuthIdentity, RefreshToken, User


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


async def _find_by_identity(
    db: AsyncSession, provider: AuthProvider, subject: str
) -> User | None:
    row = (
        await db.execute(
            select(AuthIdentity).where(
                AuthIdentity.provider == provider,
                AuthIdentity.provider_subject == subject,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return await db.get(User, row.user_id)


async def _identifier_taken(db: AsyncSession, column, value: str) -> bool:
    row = (await db.execute(select(User.id).where(column == value))).first()
    return row is not None

async def resolve_user(
    db: AsyncSession,
    *,
    provider: AuthProvider,
    subject: str,
    email: str | None = None,
    email_verified: bool = False,
    phone: str | None = None,
    phone_verified: bool = False,
    full_name: str = "",
    role: UserRole | None = None,
) -> tuple[User, bool]:
    """Find or create the user behind a proven identity.

    Returns (user, created).

    Linking rule: an existing account is only ever matched on a **verified**
    email or phone. An unverified address is still stored (it is useful, and the
    provider subject is itself proof of identity) but it never links accounts and
    never counts as verified -- otherwise someone could register a victim's
    address unverified and wait to be merged into their account.
    """
    user = await _find_by_identity(db, provider, subject)
    if user is not None:
        return user, False

    user = None
    if email and email_verified:
        user = (
            await db.execute(
                select(User).where(
                    User.email == email, User.email_verified_at.is_not(None)
                )
            )
        ).scalar_one_or_none()
    if user is None and phone and phone_verified:
        user = (
            await db.execute(
                select(User).where(
                    User.phone == phone, User.phone_verified_at.is_not(None)
                )
            )
        ).scalar_one_or_none()

    created = False
    now = datetime.now(UTC)

    if user is None:
        if not email and not phone:
            # Nothing to identify the account by. Reject cleanly rather than
            # letting the users table CHECK constraint surface as a 500.
            raise AuthError("no_identifier")

        # We are about to create an account, which means linking was refused --
        # either the identifier was unverified, or it did not match. If it is
        # nonetheless already in use, creating would violate the unique
        # constraint and surface as a 500. Refuse clearly instead.
        if email and await _identifier_taken(db, User.email, email):
            raise AuthError("email_taken")
        if phone and await _identifier_taken(db, User.phone, phone):
            raise AuthError("phone_taken")

        if role is None:
            raise AuthError("role_required")
        user = User(
            email=email,
            phone=phone,
            full_name=full_name,
            role=role,
            status=UserStatus.ACTIVE,
        )
        if email and email_verified:
            user.email_verified_at = now
        if phone and phone_verified:
            user.phone_verified_at = now
        db.add(user)
        await db.flush()
        await _ensure_profile(db, user)
        created = True
    else:
        # Backfill whichever identifier this provider proved.
        if email and email_verified and not user.email:
            user.email, user.email_verified_at = email, now
        if phone and phone_verified and not user.phone:
            user.phone, user.phone_verified_at = phone, now
        if full_name and not user.full_name:
            user.full_name = full_name

    db.add(AuthIdentity(user_id=user.id, provider=provider, provider_subject=subject))
    user.last_seen_at = now
    await db.flush()
    return user, created


async def _ensure_profile(db: AsyncSession, user: User) -> None:
    """Give every helper and hirer their profile row at creation.

    Doing it here rather than lazily means onboarding always has a row to write
    its step-by-step answers into, which is what makes the flow resumable.
    """
    if user.role is UserRole.HELPER:
        db.add(HelperProfile(user_id=user.id))
    elif user.role is UserRole.HIRER:
        db.add(HirerProfile(user_id=user.id))
    await db.flush()


async def issue_tokens(db: AsyncSession, user: User, *, device: str = "") -> TokenPair:
    raw, hashed = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hashed,
            device=device[:255],
            expires_at=refresh_expiry(),
        )
    )
    await db.flush()
    return TokenPair(
        access_token=create_access_token(user_id=user.id, role=user.role.value),
        refresh_token=raw,
    )


async def rotate_refresh_token(
    db: AsyncSession, *, raw_token: str, device: str = ""
) -> TokenPair:
    """Exchange a refresh token for a new pair.

    Replay detection: if the presented token has already been replaced, someone
    is using a stolen copy. Revoke every live token for that user rather than
    just refusing this one -- the attacker and the victim both get logged out,
    which is the correct outcome when we cannot tell which is which.
    """
    now = datetime.now(UTC)
    row = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(raw_token))
        )
    ).scalar_one_or_none()

    if row is None:
        raise AuthError("invalid_refresh_token")

    if row.replaced_by is not None or row.revoked_at is not None:
        await _revoke_all_for_user(db, row.user_id, now)
        # Commit before raising. The session dependency rolls back on any
        # exception, so without this the revocation is discarded and replay
        # detection becomes decorative -- it would return 401 while leaving the
        # stolen chain fully usable.
        await db.commit()
        raise AuthError("refresh_token_reused")

    if row.expires_at < now:
        raise AuthError("refresh_token_expired")

    user = await db.get(User, row.user_id)
    if user is None or user.status is not UserStatus.ACTIVE:
        raise AuthError("account_unavailable")

    pair = await issue_tokens(db, user, device=device)
    new_row = (
        await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == sha256_hex(pair.refresh_token)
            )
        )
    ).scalar_one()

    row.revoked_at = now
    row.replaced_by = new_row.id
    await db.flush()
    return pair


async def _revoke_all_for_user(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> None:
    rows = (
        await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
            )
        )
    ).scalars()
    for row in rows:
        row.revoked_at = now
    await db.flush()


async def revoke_refresh_token(db: AsyncSession, *, raw_token: str) -> None:
    """Logout. Silent when the token is already gone -- logout is idempotent."""
    row = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(raw_token))
        )
    ).scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        await db.flush()
