"""Shared FastAPI dependencies: current user, role gates, subscription gate."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.billing import Subscription
from app.models.enums import (
    ACTIVE_SUBSCRIPTION_STATUSES,
    UserRole,
    UserStatus,
)
from app.models.user import User

DbSession = Annotated[AsyncSession, Depends(get_db)]


def _bearer(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


async def get_current_user(request: Request, db: DbSession) -> User:
    token = _bearer(request)
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or user.status is not UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable"
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_user_optional(request: Request, db: DbSession) -> User | None:
    """For endpoints that show more to a signed-in caller but still serve guests.

    Browse uses this: anyone may see helper cards, but only a subscribed hirer
    sees contact details.
    """
    if not request.headers.get("Authorization"):
        return None
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


MaybeUser = Annotated[User | None, Depends(get_current_user_optional)]


def require_role(*roles: UserRole):
    async def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not allowed for this account type",
            )
        return user

    return dependency


require_admin = require_role(UserRole.ADMIN)
require_helper = require_role(UserRole.HELPER)
require_hirer = require_role(UserRole.HIRER)


async def has_active_subscription(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """The single definition of paid access, used everywhere.

    AUTHENTICATED counts alongside ACTIVE because Razorpay sets it once the
    mandate is approved but before the first charge settles -- excluding it
    would lock out a user who has genuinely just paid.
    """
    row = (
        await db.execute(
            select(Subscription.id).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
                Subscription.current_end > datetime.now(UTC),
            )
        )
    ).first()
    return row is not None


async def require_active_subscription(user: CurrentUser, db: DbSession) -> User:
    """Gate for paid features.

    Returns 402 Payment Required rather than 403, so the client can tell the
    difference between "you may not do this" and "you need to subscribe" and
    show the paywall instead of an error.
    """
    if not await has_active_subscription(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="A Sahaya membership is needed for this.",
        )
    return user


SubscribedUser = Annotated[User, Depends(require_active_subscription)]
