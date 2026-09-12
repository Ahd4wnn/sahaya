"""Make somebody an admin, by phone number.

    python -m app.db.make_admin +919744637363 --name "Adon Joseph"
    python -m app.db.make_admin +919744637363 --demote-to hirer

Through the ORM rather than a hand-written INSERT: `users.id` is a uuid7
generated in Python, `role` and `status` are native PostgreSQL enums, and
`notification_prefs` has a default that a raw insert would have to know about.
Getting any of those wrong produces a row that looks fine and then fails
somewhere else.

An admin has no helper or hirer profile, which is deliberate -- admins do not
appear in search and have no membership. See `_ensure_profile` in
app/services/auth_service.py, which only makes one for the two real sides.

Signing in afterwards: the admin uses the ordinary phone OTP flow. While
SMS_BACKEND=console the code is printed to the API's log rather than sent --
`journalctl -u sahaya-api -f` on the server, or the terminal in development.
"""

import argparse
import asyncio
import sys
from datetime import UTC, datetime

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.enums import AuthProvider, UserRole, UserStatus
from app.models.user import AuthIdentity, User
from app.schemas.auth import normalize_phone


async def make_admin(phone: str, name: str, email: str, role: UserRole) -> int:
    async with SessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.phone == phone))
        ).scalar_one_or_none()

        if email:
            clash = (
                await db.execute(
                    select(User).where(
                        User.email == email, User.id != (user.id if user else None)
                    )
                )
            ).scalar_one_or_none()
            if clash is not None:
                print(f"{email} already belongs to another account ({clash.phone or clash.id}).")
                return 1

        if user is None:
            if role is not UserRole.ADMIN:
                print(f"No account for {phone}, and --demote-to only changes an existing one.")
                return 1
            user = User(
                phone=phone,
                full_name=name,
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                # Verified on the spot: this is a deliberate act by whoever has
                # root on the server, not a claim that needs proving by SMS.
                phone_verified_at=datetime.now(UTC),
                email=email or None,
                # Verified too, and that word is load-bearing: Google sign-in
                # links to an existing account by *verified* email only
                # (auth_service.resolve_user). Without this the first Google
                # sign-in would make a second account instead of finding this
                # one.
                email_verified_at=datetime.now(UTC) if email else None,
            )
            db.add(user)
            await db.flush()
            # The identity row is what the phone sign-in looks up. Without it
            # the first sign-in would create a *second* account for the same
            # number -- or rather, try to, and fail on the unique constraint.
            db.add(
                AuthIdentity(
                    user_id=user.id,
                    provider=AuthProvider.PHONE,
                    provider_subject=phone,
                )
            )
            await db.commit()
            print(f"created admin {phone} ({name or 'no name set'})")
            print(f"  id     {user.id}")
            if email:
                print(f"  email  {email} (verified -- Google sign-in will find this account)")
            print("  sign in at /signin with this number; the code is in the API log")
            return 0

        # An email can be added to an existing account on its own, so this is
        # also how an admin made from a phone number gets Google sign-in.
        added_email = False
        if email and user.email != email:
            user.email = email
            user.email_verified_at = datetime.now(UTC)
            added_email = True

        was = user.role
        if was is role and not added_email:
            print(f"{phone} is already {role.value} -- nothing to do.")
            if user.status is not UserStatus.ACTIVE:
                print(f"  note: the account is {user.status.value}, so sign-in is refused")
            return 0

        user.role = role
        if name and not user.full_name:
            user.full_name = name
        # An existing account keeps its profile row: demoting an admin back to
        # hirer without one would leave them a family with nowhere to store
        # their household. Nothing here deletes a profile either -- a role
        # change is reversible, and a deleted profile is not.
        await db.commit()
        if was is role:
            print(f"{phone} was already {role.value}")
        else:
            print(f"{phone}: {was.value} -> {role.value}")
        print(f"  name   {user.full_name or '(not set)'}")
        if added_email:
            print(f"  email  {email} (verified -- Google sign-in will find this account)")
        print(f"  id     {user.id}")
        if user.status is not UserStatus.ACTIVE:
            print(f"  note: the account is {user.status.value}, so sign-in is refused")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Promote a phone number to admin, creating the account if it does not exist.",
    )
    parser.add_argument("phone", help="any shape: +919744637363, 09744637363, 9744637363")
    parser.add_argument("--name", default="", help="full name, set only if it is blank")
    parser.add_argument(
        "--email",
        default="",
        help="a verified email, so Google sign-in finds this account instead of making one",
    )
    parser.add_argument(
        "--demote-to",
        choices=[r.value for r in UserRole if r is not UserRole.ADMIN],
        help="turn an existing admin back into a helper or a family",
    )
    args = parser.parse_args()

    try:
        phone = normalize_phone(args.phone)
    except ValueError as exc:
        print(f"{args.phone!r}: {exc}")
        return 2

    email = args.email.strip().lower()
    if email:
        try:
            # The same validator the API uses, so an address accepted here
            # cannot be one the sign-in flow would later reject.
            email = validate_email(email, check_deliverability=False).normalized
        except EmailNotValidError as exc:
            print(f"{args.email!r}: {exc}")
            return 2

    role = UserRole(args.demote_to) if args.demote_to else UserRole.ADMIN
    return asyncio.run(make_admin(phone, args.name.strip(), email, role))


if __name__ == "__main__":
    sys.exit(main())
