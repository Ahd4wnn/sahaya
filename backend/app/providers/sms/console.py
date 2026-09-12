"""Development SMS sender -- prints the OTP to the terminal.

Deliberate: MSG91 requires TRAI DLT registration which takes about a week and
costs money. Blocking all auth work on that would be absurd, so development
reads codes from the log instead.
"""

import logging

from app.providers.sms.base import SmsSender

logger = logging.getLogger("sahaya.sms")


class ConsoleSmsSender(SmsSender):
    async def send(self, *, to: str, message: str) -> None:
        logger.warning(
            "\n--- SMS (console backend) ---\nTo: %s\n%s\n-----------------------------",
            to,
            message,
        )
