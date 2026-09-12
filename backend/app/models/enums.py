"""Enums shared by models and schemas. Mirrored as native PostgreSQL enum types."""

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    HELPER = "helper"
    HIRER = "hirer"


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class AuthProvider(StrEnum):
    GOOGLE = "google"
    APPLE = "apple"
    EMAIL = "email"
    PHONE = "phone"


class OtpChannel(StrEnum):
    SMS = "sms"
    EMAIL = "email"


class OtpPurpose(StrEnum):
    LOGIN = "login"
    VERIFY_EMAIL = "verify_email"
    VERIFY_PHONE = "verify_phone"


class Shift(StrEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    FULL_DAY = "full_day"


class CutoutStatus(StrEnum):
    """Whether background removal produced a usable transparent portrait.

    FAILED is not an error state for the helper -- the card falls back to a
    circular crop that still straddles the panel edge. See docs/06-design-system.md.
    """

    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"


class VerificationStatus(StrEnum):
    NONE = "none"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class DocumentKind(StrEnum):
    ID_PROOF = "id_proof"
    ADDRESS_PROOF = "address_proof"
    POLICE_VERIFICATION = "police_verification"
    PHOTO = "photo"


class DocumentStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class HireRequestStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"


class ReviewDirection(StrEnum):
    HIRER_TO_HELPER = "hirer_to_helper"
    HELPER_TO_HIRER = "helper_to_hirer"


class PlanCode(StrEnum):
    HELPER_MONTHLY = "helper_monthly"
    HIRER_MONTHLY = "hirer_monthly"


class SubscriptionStatus(StrEnum):
    """Mirrors Razorpay's subscription states exactly, so webhook handling is a
    direct mapping with no translation layer to get wrong."""

    CREATED = "created"
    AUTHENTICATED = "authenticated"
    ACTIVE = "active"
    PENDING = "pending"
    HALTED = "halted"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    EXPIRED = "expired"


#: Statuses that grant access, subject to current_end still being in the future.
#: AUTHENTICATED is included because Razorpay sets it once the mandate is approved
#: but before the first charge settles -- excluding it locks out a paying user.
ACTIVE_SUBSCRIPTION_STATUSES = (
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.AUTHENTICATED,
)
