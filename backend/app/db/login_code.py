"""Issue a login code for a phone number, and print it.

    python -m app.db.login_code +919744637363

Same flow as an SMS, different delivery: it writes exactly the row
`/auth/phone/start` writes, so `/auth/phone/verify` accepts the code with no
special case anywhere in the API. Nothing is sent.

This exists because there is deliberately **no way to skip the OTP over HTTP**.
Revealing codes in an API response is gated on `APP_ENV == "development"` *and*
a console sender (app/api/v1/auth.py), because an endpoint that hands out a
login code for any number you name is an account takeover for every account on
the site. So the bypass lives here instead, where using it already requires
what it would otherwise grant: access to the server.

For real people who cannot read a server log, configure Google sign-in --
docs/11-deployment.md, "Signing in while there is no SMS provider".
"""

import argparse
import asyncio
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.security import generate_otp, otp_expiry, sha256_hex
from app.db.session import SessionLocal
from app.models.enums import OtpChannel, OtpPurpose
from app.models.user import OtpCode, User
from app.schemas.auth import normalize_phone


async def issue(phone: str) -> int:
    async with SessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.phone == phone))
        ).scalar_one_or_none()

        now = datetime.now(UTC)
        # Retire whatever is outstanding first, exactly as the API does -- two
        # live codes for one number is a smaller window than it looks, but it
        # is still a window.
        outstanding = (
            await db.execute(
                select(OtpCode).where(
                    OtpCode.target == phone,
                    OtpCode.purpose == OtpPurpose.LOGIN,
                    OtpCode.consumed_at.is_(None),
                )
            )
        ).scalars()
        retired = 0
        for row in outstanding:
            row.consumed_at = now
            retired += 1

        code = generate_otp()
        expires = otp_expiry()
        db.add(
            OtpCode(
                target=phone,
                channel=OtpChannel.SMS,
                purpose=OtpPurpose.LOGIN,
                code_hash=sha256_hex(code),
                expires_at=expires,
            )
        )
        await db.commit()

        minutes = round((expires - now).total_seconds() / 60)
        print(f"\n  {phone}   code: {code}\n")
        print(f"  valid for {minutes} minutes, {settings.OTP_MAX_ATTEMPTS} attempts")
        if retired:
            print(f"  ({retired} earlier code{'s' if retired > 1 else ''} retired)")
        if user is None:
            print("  no account with this number yet -- verifying it will create one,")
            print("  and the sign-up form decides whether it is a family or a helper")
        else:
            print(f"  signs in as {user.full_name or '(no name)'}, role {user.role.value}")
        print("\n  enter it at https://sahaya.life/signin -> Continue with phone\n")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Issue a phone login code and print it, without sending anything.",
    )
    parser.add_argument("phone", help="any shape: +919744637363, 09744637363, 9744637363")
    args = parser.parse_args()

    try:
        phone = normalize_phone(args.phone)
    except ValueError as exc:
        print(f"{args.phone!r}: {exc}")
        return 2
    return asyncio.run(issue(phone))


if __name__ == "__main__":
    sys.exit(main())
