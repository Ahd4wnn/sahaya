"""Ask Sahaya: the assistant thread in the chat page.

Free for every signed-in account, families and helpers alike -- support that
costs money is not support, and a lapsed member is exactly the person who needs
to ask why. What keeps that affordable is the per-account daily cap, not a
paywall (DECISIONS.md 023).

Three routes, and none of them can act on anybody's behalf: the assistant
answers, and where it suggests messaging a helper it returns a proposal the
person taps. That tap goes to POST /conversations and POST
/conversations/{id}/messages like any other, so membership and role rules are
enforced in exactly one place, as they were before this existed.
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, tuple_

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.messaging import AssistantMessage
from app.providers.llm.base import LlmError
from app.providers.registry import get_llm
from app.services.assistant import runner
from app.services.assistant.prompt import greeting

router = APIRouter(tags=["assistant"])


class AssistantTurn(BaseModel):
    id: uuid.UUID
    role: str
    body: str
    #: What the assistant offered -- `{"kind": "message_helper", ...}` -- which
    #: the client renders as a button. Nothing here has happened yet.
    actions: list[dict[str, Any]]
    created_at: datetime


class AssistantThread(BaseModel):
    #: False when no API key is configured. The client then does not show the
    #: thread at all, rather than showing one that answers 503.
    enabled: bool
    #: Shown above an empty thread. Fixed text, not a model call.
    greeting: str
    messages: list[AssistantTurn]
    has_more: bool
    remaining_today: int
    daily_limit: int


class AskIn(BaseModel):
    body: str = Field(min_length=1, max_length=runner.MAX_BODY)


class AskOut(BaseModel):
    #: Echoed back so the client can replace its optimistic bubble with the
    #: stored one, exactly as the chat composer does.
    question: AssistantTurn
    answer: AssistantTurn
    remaining_today: int


def _turn(row: AssistantMessage) -> AssistantTurn:
    return AssistantTurn(
        id=row.id,
        role=row.role,
        body=row.body,
        actions=row.actions or [],
        created_at=row.created_at,
    )


@router.get("/me/assistant", response_model=AssistantThread)
async def read_thread(
    user: CurrentUser,
    db: DbSession,
    before: uuid.UUID | None = Query(
        default=None, description="Turn id; returns the page older than it"
    ),
    limit: int = Query(default=40, ge=1, le=100),
) -> AssistantThread:
    """The thread, latest page first-loaded. Also what tells the chat list
    whether to show the pinned row at all."""
    # Only the current conversation: a turn from before the last "start over"
    # stays in the table (the day's usage is counted from it) but is not shown.
    stmt = runner.visible(
        select(AssistantMessage).where(
            AssistantMessage.user_id == user.id,
            AssistantMessage.role.in_(("user", "assistant")),
        ),
        await runner.boundary(db, user.id),
    )
    if before is not None:
        pivot = await db.get(AssistantMessage, before)
        if pivot is None or pivot.user_id != user.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown cursor.")
        # Row-value comparison, so two turns sharing a timestamp still page in
        # a stable order -- the same cursor rule as chat messages.
        stmt = stmt.where(
            tuple_(AssistantMessage.created_at, AssistantMessage.id)
            < tuple_(pivot.created_at, pivot.id)
        )

    rows = (
        (
            await db.execute(
                stmt.order_by(
                    AssistantMessage.created_at.desc(), AssistantMessage.id.desc()
                ).limit(limit + 1)
            )
        )
        .scalars()
        .all()
    )
    has_more = len(rows) > limit
    page = list(reversed(rows[:limit]))

    return AssistantThread(
        enabled=get_llm().available,
        greeting=greeting(user),
        messages=[_turn(row) for row in page],
        has_more=has_more,
        remaining_today=await runner.remaining_today(db, user.id),
        daily_limit=settings.ASSISTANT_DAILY_MESSAGE_LIMIT,
    )


@router.post(
    "/me/assistant/messages", response_model=AskOut, status_code=status.HTTP_201_CREATED
)
async def ask(payload: AskIn, user: CurrentUser, db: DbSession) -> AskOut:
    """One question, one answer.

    503 when the assistant is off or the model could not be reached, and in
    that case nothing is stored: the rollback leaves no half-conversation, and
    the client keeps the person's text for a retry.
    """
    try:
        answer = await runner.reply(db, user, payload.body)
    except runner.AssistantLimitError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from None
    except LlmError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None

    question = (
        await db.execute(
            select(AssistantMessage)
            .where(
                AssistantMessage.user_id == user.id,
                AssistantMessage.role == "user",
            )
            .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
            .limit(1)
        )
    ).scalar_one()

    return AskOut(
        question=_turn(question),
        answer=_turn(answer),
        remaining_today=await runner.remaining_today(db, user.id),
    )


@router.post("/me/assistant/reset", status_code=status.HTTP_204_NO_CONTENT)
async def start_over(user: CurrentUser, db: DbSession) -> None:
    """Start a fresh conversation.

    A line under what came before, not a delete: the assistant stops seeing
    the old turns and the thread shows none of them, while the day's usage
    still counts -- otherwise Start over would be a free way around the cap.
    """
    await runner.start_over(db, user.id)
