"""All models, imported here so Alembic autogenerate sees every table."""

from app.models.billing import Payment, Plan, Subscription, WebhookEvent
from app.models.engagement import Favorite, Notification
from app.models.enums import *  # noqa: F403
from app.models.geo import District, Town
from app.models.marketplace import (
    Document,
    HelperProfile,
    HireRequest,
    HirerProfile,
    Review,
)
from app.models.messaging import AssistantMessage, Conversation, Message
from app.models.taxonomy import HelperSkill, Service, Skill
from app.models.user import AdminAction, AuthIdentity, OtpCode, RefreshToken, User

__all__ = [
    "AdminAction",
    "AssistantMessage",
    "AuthIdentity",
    "Conversation",
    "District",
    "Document",
    "Favorite",
    "HelperProfile",
    "HelperSkill",
    "HireRequest",
    "HirerProfile",
    "Message",
    "Notification",
    "OtpCode",
    "Payment",
    "Plan",
    "RefreshToken",
    "Review",
    "Service",
    "Skill",
    "Subscription",
    "Town",
    "User",
    "WebhookEvent",
]
