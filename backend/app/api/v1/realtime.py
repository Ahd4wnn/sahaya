"""The realtime socket.

One WebSocket per open tab. It carries announcements only -- new messages,
read receipts, typing, new notifications. Every action still goes through
REST, so there is exactly one place that validates and saves anything, and a
client that loses its socket loses immediacy, never data.

Auth is the first frame, not the URL. Browsers cannot set an Authorization
header on a WebSocket, and a token in the query string ends up in proxy and
access logs.

Protocol, client to server:
    {"type": "auth", "token": "<access token>"}      must be the first frame
    {"type": "ping"}                                  -> {"type": "pong"}
    {"type": "typing", "conversation_id": "<uuid>"}   relayed, never stored

Server to client:
    {"type": "ready"}
    {"type": "message" | "read" | "typing" | "notification", "data": {...}}
"""

import asyncio
import uuid

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.enums import UserStatus
from app.models.messaging import Conversation
from app.models.user import User
from app.realtime.hub import hub
from app.services.events import publish

router = APIRouter(tags=["realtime"])

AUTH_TIMEOUT_SECONDS = 10
#: Application close codes live in 4000-4999. 4401 mirrors HTTP 401, so the
#: client knows to refresh its token rather than retry blindly.
CLOSE_UNAUTHORIZED = 4401


async def _authenticate(frame: object) -> uuid.UUID | None:
    if not isinstance(frame, dict) or frame.get("type") != "auth":
        return None
    try:
        payload = decode_access_token(str(frame.get("token", "")))
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None

    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is None or user.status is not UserStatus.ACTIVE:
            return None
        return user.id


async def _relay_typing(user_id: uuid.UUID, conversation_id: object) -> None:
    """Typing is ephemeral: relayed to the other participant, never stored."""
    try:
        convo_id = uuid.UUID(str(conversation_id))
    except ValueError:
        return
    async with SessionLocal() as db:
        convo = await db.get(Conversation, convo_id)
        if convo is None or not convo.is_participant(user_id):
            return
        await publish(
            db,
            to=[convo.other(user_id)],
            type="typing",
            data={"conversation_id": str(convo.id), "user_id": str(user_id)},
        )
        await db.commit()


@router.websocket("/ws")
async def socket(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        first = await asyncio.wait_for(
            websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS
        )
    except (TimeoutError, WebSocketDisconnect, ValueError):
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    user_id = await _authenticate(first)
    if user_id is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    hub.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            frame = await websocket.receive_json()
            kind = frame.get("type") if isinstance(frame, dict) else None
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
            elif kind == "typing":
                await _relay_typing(user_id, frame.get("conversation_id"))
    except (WebSocketDisconnect, ValueError):
        # ValueError is a non-JSON frame; either way this socket is done.
        pass
    finally:
        hub.disconnect(user_id, websocket)
