"""MSG91 SMS sender.

Chosen for India: roughly Rs 0.15-0.25 per OTP against Twilio's Rs 0.45+ once
forex and markup are counted. Requires TRAI DLT registration (PE + header,
about a week) before it will deliver.
"""

import httpx

from app.core.config import settings
from app.providers.sms.base import SmsSender


class Msg91SmsSender(SmsSender):
    ENDPOINT = "https://control.msg91.com/api/v5/flow/"

    async def send(self, *, to: str, message: str) -> None:
        # MSG91 wants the number without a leading +.
        recipient = to.lstrip("+")
        payload = {
            "template_id": settings.MSG91_DLT_TE_ID,
            "sender": settings.MSG91_SENDER_ID,
            "short_url": "0",
            "recipients": [{"mobiles": recipient, "MESSAGE": message}],
        }
        headers = {
            "authkey": settings.MSG91_AUTH_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(self.ENDPOINT, json=payload, headers=headers)
            response.raise_for_status()
