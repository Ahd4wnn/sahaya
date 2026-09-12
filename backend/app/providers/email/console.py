"""Development email sender -- prints to the terminal.

This is what makes the whole auth flow buildable and testable before any SMTP
credentials exist.
"""

import logging

from app.providers.email.base import EmailSender

logger = logging.getLogger("sahaya.email")


class ConsoleEmailSender(EmailSender):
    async def send(self, *, to: str, subject: str, body: str) -> None:
        logger.warning(
            "\n--- EMAIL (console backend) ---\nTo: %s\nSubject: %s\n\n%s\n-------------------------------",
            to,
            subject,
            body,
        )
