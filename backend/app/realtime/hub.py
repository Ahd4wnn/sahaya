"""One LISTEN connection per API process, fanning events out to that process's
WebSockets.

Why PostgreSQL and not Redis: there is already a database and no Redis, and
adding a service to run and monitor just to move chat events around is the
wrong trade at this size. LISTEN/NOTIFY works across any number of API
processes -- each holds its own listener and hears every event -- and it
survives the move to AWS, since RDS supports it. If fan-out ever outgrows it,
this class is the only thing that changes. See docs/DECISIONS.md 017.
"""

import asyncio
import contextlib
import json
import logging
import uuid
from collections import defaultdict

import asyncpg
from fastapi import WebSocket

from app.core.config import settings
from app.services.events import CHANNEL

logger = logging.getLogger("sahaya.realtime")

#: How often the listener proves its connection is alive. `is_closed()` alone
#: misses a socket that died silently (a laptop sleeping, a NAT timeout), and a
#: dead listener fails in the worst way: everything looks up, nothing arrives.
HEARTBEAT_SECONDS = 5

#: Close code for a revoked session. Mirrors HTTP 403, and the client treats it
#: as final: it stops reconnecting rather than retrying a banned credential.
CLOSE_REVOKED = 4403


class Hub:
    def __init__(self) -> None:
        self._sockets: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._conn: asyncpg.Connection | None = None
        self._task: asyncio.Task | None = None
        self._stopping = False

    # ------------------------------------------------------------------ #
    # sockets
    # ------------------------------------------------------------------ #
    def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        self._sockets[user_id].add(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        sockets = self._sockets.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self._sockets.pop(user_id, None)

    def is_online(self, user_id: uuid.UUID) -> bool:
        return bool(self._sockets.get(user_id))

    # ------------------------------------------------------------------ #
    # lifecycle
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        self._stopping = False
        self._task = asyncio.create_task(self._run(), name="realtime-listener")

    async def stop(self) -> None:
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._conn is not None and not self._conn.is_closed():
            await self._conn.close()

    async def _run(self) -> None:
        """Hold the LISTEN connection, and rebuild it whenever it drops."""
        dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
        delay = 1
        while not self._stopping:
            try:
                self._conn = await asyncpg.connect(dsn)
                await self._conn.add_listener(CHANNEL, self._on_notify)
                logger.info("realtime listener connected")
                delay = 1
                while not self._conn.is_closed():
                    await asyncio.sleep(HEARTBEAT_SECONDS)
                    await self._conn.execute("SELECT 1")
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 -- any failure means reconnect
                logger.warning("realtime listener lost (%s); retrying in %ss", exc, delay)
            finally:
                if self._conn is not None and not self._conn.is_closed():
                    with contextlib.suppress(Exception):
                        await self._conn.close()
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)

    # ------------------------------------------------------------------ #
    # fan-out
    # ------------------------------------------------------------------ #
    def _on_notify(self, _conn, _pid, _channel, payload: str) -> None:
        try:
            event = json.loads(payload)
        except ValueError:
            logger.warning("dropping malformed realtime payload")
            return

        revoke = event.get("type") == "session_revoked"
        frame = json.dumps(
            {"type": event.get("type"), "data": event.get("data", {})},
            ensure_ascii=False,
        )
        for raw in event.get("to", []):
            try:
                user_id = uuid.UUID(raw)
            except ValueError:
                continue
            for websocket in list(self._sockets.get(user_id, ())):
                if revoke:
                    # A suspended account must stop hearing messages now, not
                    # whenever its tab next reconnects. 4403 tells the client
                    # this is final and not to retry.
                    self.disconnect(user_id, websocket)
                    asyncio.create_task(websocket.close(code=CLOSE_REVOKED))
                else:
                    asyncio.create_task(self._send(user_id, websocket, frame))

    async def _send(self, user_id: uuid.UUID, websocket: WebSocket, frame: str) -> None:
        try:
            await websocket.send_text(frame)
        except Exception:  # noqa: BLE001 -- a dead socket is simply dropped
            self.disconnect(user_id, websocket)


hub = Hub()
