"""SMTP sender. Works with Brevo, Zoho, SES, or any standard provider."""

import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.providers.email.base import EmailSender


class SmtpEmailSender(EmailSender):
    async def send(self, *, to: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = settings.SMTP_FROM
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)

        # smtplib is blocking; keep it off the event loop.
        await asyncio.to_thread(self._deliver, message)

    @staticmethod
    def _deliver(message: EmailMessage) -> None:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
