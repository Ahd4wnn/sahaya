"""Auth request and response shapes."""

import re
import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole

#: Indian mobile numbers in E.164. Kerala-only launch, so +91 with a leading
#: 6-9 covers every real mobile; landlines cannot receive SMS anyway.
INDIA_MOBILE = re.compile(r"^\+91[6-9]\d{9}$")


def normalize_phone(value: str) -> str:
    """Accept the shapes people actually type and store one canonical form.

    "98470 12345", "098470-12345", "+91 98470 12345" and "9198470 12345" are all
    the same number, and a helper who signs up one way must be able to sign in
    another. Storing a canonical +91XXXXXXXXXX is also what makes the phone
    column's UNIQUE constraint meaningful.
    """
    digits = re.sub(r"[^\d+]", "", value)
    digits = digits.removeprefix("+")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    candidate = f"+91{digits}"
    if not INDIA_MOBILE.match(candidate):
        raise ValueError("Enter a valid 10-digit Indian mobile number")
    return candidate


class PhoneStartIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class PhoneVerifyIn(PhoneStartIn):
    code: str = Field(min_length=4, max_length=8)
    role: UserRole | None = None
    full_name: str = ""


class EmailStartIn(BaseModel):
    email: EmailStr


class EmailVerifyIn(EmailStartIn):
    code: str = Field(min_length=4, max_length=8)
    role: UserRole | None = None
    full_name: str = ""


class GoogleIn(BaseModel):
    id_token: str
    role: UserRole | None = None


class AppleIn(BaseModel):
    identity_token: str
    role: UserRole | None = None
    full_name: str = ""


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    phone: str | None
    full_name: str
    role: UserRole
    email_verified: bool
    phone_verified: bool

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    """What the client gets after any successful sign-in."""

    user: UserOut
    tokens: TokenOut
    created: bool
    onboarding_step: int = 1
    has_active_subscription: bool = False
    #: Whether Ask Sahaya is configured on this server. It rides along with the
    #: session because the client needs it on every page -- the menu item and
    #: the Help page link must not exist when the assistant cannot answer --
    #: and the session is the one thing already fetched once at boot.
    assistant_enabled: bool = False


class StartOut(BaseModel):
    sent: bool = True
    #: Populated only when SMS_BACKEND/EMAIL_BACKEND is `console`, so developers
    #: are not digging through logs. Never populated once a real provider is on.
    dev_code: str | None = None
