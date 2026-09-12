"""Email sending interface. No application code imports an SMTP library directly."""

from abc import ABC, abstractmethod


class EmailSender(ABC):
    @abstractmethod
    async def send(self, *, to: str, subject: str, body: str) -> None: ...

    async def send_otp(self, *, to: str, code: str) -> None:
        await self.send(
            to=to,
            subject=f"{code} is your Sahaya code",
            body=(
                f"Your Sahaya verification code is {code}.\n\n"
                "It expires in 10 minutes. If you did not request it, ignore this email."
            ),
        )
