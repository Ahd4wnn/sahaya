"""Realtime events, fanned out over PostgreSQL LISTEN/NOTIFY.

`publish()` is called inside the request's own transaction, and that is the
whole design. NOTIFY is transactional: PostgreSQL delivers it only when the
transaction commits, and discards it on rollback. So a message that fails to
save can never be announced, and one that saves always is -- with no outbox
table, no retry loop and no "saved but never pushed" window of our own.

The listener side lives in app/realtime/hub.py. See docs/DECISIONS.md 017.
"""

import json
import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

CHANNEL = "sahaya_events"

#: PostgreSQL rejects NOTIFY payloads over 8000 bytes. Events carry ids and a
#: bounded preview (a chat message is capped at 2000 characters), so this is a
#: backstop, not a normal path.
MAX_PAYLOAD_BYTES = 7900


def _encode(to: list[str], event_type: str, data: dict[str, Any]) -> str:
    return json.dumps(
        {"to": to, "type": event_type, "data": data},
        default=str,
        separators=(",", ":"),
        ensure_ascii=False,
    )


async def publish(
    db: AsyncSession,
    *,
    to: Iterable[uuid.UUID],
    type: str,  # noqa: A002 -- mirrors the wire field name
    data: dict[str, Any],
) -> None:
    """Announce an event to the given users, on commit."""
    recipients = sorted({str(user_id) for user_id in to})
    if not recipients:
        return

    payload = _encode(recipients, type, data)
    if len(payload.encode()) > MAX_PAYLOAD_BYTES:
        # Too big to carry -- send the bare fact that something changed and let
        # the client fetch the detail over REST, where no size limit applies.
        slim = {k: v for k, v in data.items() if k.endswith("_id")}
        payload = _encode(recipients, type, slim)

    await db.execute(select(func.pg_notify(CHANNEL, payload)))
