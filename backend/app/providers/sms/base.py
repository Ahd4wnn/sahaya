"""SMS sending interface."""

from abc import ABC, abstractmethod


class SmsSender(ABC):
    @abstractmethod
    async def send(self, *, to: str, message: str) -> None: ...

    async def send_otp(self, *, to: str, code: str) -> None:
        await self.send(
            to=to, message=f"{code} is your Sahaya verification code. Valid for 10 minutes."
        )
