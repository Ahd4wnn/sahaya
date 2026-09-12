"""One turn of Ask Sahaya: the person's message in, a saved reply out.

The shape is deliberately boring -- save the question, loop a bounded number of
tool rounds, save the answer. Two things in it matter:

* **Nothing is stored when the model fails.** The route turns LlmError into a
  503 and the transaction rolls back, so the person keeps their text and the
  client offers a retry -- the same behaviour a failed chat message already
  has. A half-thread with a question and no answer would be worse than
  nothing.
* **The tool loop is bounded, and a failing tool is an answer.** A tool that
  returns `{"error": ...}` teaches the model what went wrong in the same turn;
  raising would lose the whole reply over a bad district slug.
"""

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.messaging import AssistantMessage
from app.models.user import User
from app.providers.llm.base import LlmError, LlmMessage, LlmReply
from app.providers.registry import get_llm
from app.services.assistant import tools as toolkit
from app.services.assistant.prompt import build_instructions
from app.services.events import publish

logger = logging.getLogger("sahaya.assistant")

#: Tool rounds per message. Search, then maybe propose, then answer -- three is
#: room for a correction, and a ceiling on what one message can cost.
MAX_TOOL_ROUNDS = 3
MAX_BODY = 1000


class AssistantLimitError(Exception):
    """The daily cap. Carries the sentence the person is shown."""


async def used_today(db: AsyncSession, user_id) -> int:
    """Messages this person has sent since midnight UTC.

    UTC rather than IST is a small unfairness (the day turns at 5:30am in
    Kerala) traded for a definition that cannot drift with a server's timezone.
    """
    since = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        await db.execute(
            select(func.count())
            .select_from(AssistantMessage)
            .where(
                AssistantMessage.user_id == user_id,
                AssistantMessage.role == "user",
                AssistantMessage.created_at >= since,
            )
        )
    ).scalar_one()


async def remaining_today(db: AsyncSession, user_id) -> int:
    return max(0, settings.ASSISTANT_DAILY_MESSAGE_LIMIT - await used_today(db, user_id))


#: A "start over" marker, stored as a turn of its own rather than by deleting
#: rows. Deleting would also delete the day's usage count and hand anybody an
#: unlimited assistant for the price of tapping Start over; and `role` was
#: always a plain string precisely so a third kind of turn needs no migration.
RESET_ROLE = "reset"


async def boundary(db: AsyncSession, user_id) -> datetime | None:
    """When this person last started over, if they have."""
    return (
        await db.execute(
            select(AssistantMessage.created_at)
            .where(
                AssistantMessage.user_id == user_id,
                AssistantMessage.role == RESET_ROLE,
            )
            .order_by(AssistantMessage.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def visible(stmt, since: datetime | None):
    """Restrict a query to the turns since the last start-over."""
    return stmt if since is None else stmt.where(AssistantMessage.created_at > since)


async def history(db: AsyncSession, user_id, turns: int) -> list[AssistantMessage]:
    """The last `turns` turns of the current conversation, oldest first."""
    stmt = visible(
        select(AssistantMessage).where(
            AssistantMessage.user_id == user_id,
            AssistantMessage.role.in_(("user", "assistant")),
        ),
        await boundary(db, user_id),
    )
    rows = (
        (
            await db.execute(
                stmt.order_by(
                    AssistantMessage.created_at.desc(), AssistantMessage.id.desc()
                ).limit(turns)
            )
        )
        .scalars()
        .all()
    )
    return list(reversed(rows))


async def start_over(db: AsyncSession, user_id) -> None:
    """Put a line under the conversation so far."""
    db.add(AssistantMessage(user_id=user_id, role=RESET_ROLE, body=""))
    await db.flush()


def _hours_until_reset() -> int:
    now = datetime.now(UTC)
    midnight = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return max(1, round((midnight - now).total_seconds() / 3600))


async def reply(db: AsyncSession, user: User, body: str) -> AssistantMessage:
    """Answer one message. Returns the saved assistant turn."""
    llm = get_llm()
    if not llm.available:
        raise LlmError(
            "Ask Sahaya is not switched on yet. Add OPENAI_API_KEY to "
            "backend/.env and restart the server."
        )

    text = " ".join(body.split())[:MAX_BODY]
    if not text:
        raise LlmError("Write a message first.")

    if await used_today(db, user.id) >= settings.ASSISTANT_DAILY_MESSAGE_LIMIT:
        raise AssistantLimitError(
            f"You have reached today's {settings.ASSISTANT_DAILY_MESSAGE_LIMIT} "
            f"messages with Ask Sahaya. It resets in about {_hours_until_reset()} "
            "hours. You can still message helpers directly."
        )

    past = await history(db, user.id, settings.ASSISTANT_HISTORY_TURNS)

    question = AssistantMessage(user_id=user.id, role="user", body=text)
    db.add(question)
    await db.flush()

    instructions = await build_instructions(db, user)
    schemas = toolkit.tool_schemas(can_message=user.role.value == "hirer")

    # The transcript: stored turns, then this question. Proposed actions are
    # not replayed -- what the model needs to remember is what it said, and
    # whether the person acted is visible in the next thing they type.
    messages: list[LlmMessage] = [
        LlmMessage(role="assistant" if row.role == "assistant" else "user", content=row.body)
        for row in past
    ]
    messages.append(LlmMessage(role="user", content=text))

    actions: list[dict] = []
    usage = {"input_tokens": 0, "output_tokens": 0}
    answer: LlmReply | None = None

    for round_number in range(1, MAX_TOOL_ROUNDS + 1):
        answer = await llm.respond(
            instructions=instructions,
            messages=messages,
            tools=schemas,
            max_output_tokens=settings.ASSISTANT_MAX_OUTPUT_TOKENS,
        )
        usage = {
            "input_tokens": usage["input_tokens"] + answer.usage.get("input_tokens", 0),
            "output_tokens": usage["output_tokens"] + answer.usage.get("output_tokens", 0),
        }
        if not answer.tool_calls:
            break

        messages.append(
            LlmMessage(role="assistant", content=answer.text, tool_calls=answer.tool_calls)
        )
        for call in answer.tool_calls:
            result = await toolkit.execute(db, user, call)
            # Arguments and result size, because "why did it say that?" is
            # otherwise unanswerable after the fact.
            logger.info(
                "assistant: tool %s(%s) -> %s keys, %s action(s)",
                call.name,
                json.dumps(call.arguments, default=str, ensure_ascii=False)[:300],
                len(result.output),
                len(result.actions),
            )
            for action in result.actions:
                if len(actions) < toolkit.MAX_ACTIONS and action not in actions:
                    actions.append(action)
            messages.append(
                LlmMessage(
                    role="tool",
                    tool_call_id=call.id,
                    content=json.dumps(result.output, default=str, ensure_ascii=False),
                )
            )
        if round_number == MAX_TOOL_ROUNDS:
            # Out of rounds: ask for words, with the tools withdrawn so the
            # model cannot spend another round asking for more of them.
            answer = await llm.respond(
                instructions=instructions,
                messages=messages,
                tools=[],
                max_output_tokens=settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            )
            usage = {
                "input_tokens": usage["input_tokens"] + answer.usage.get("input_tokens", 0),
                "output_tokens": usage["output_tokens"]
                + answer.usage.get("output_tokens", 0),
            }

    assert answer is not None  # the loop runs at least once

    saved = AssistantMessage(
        user_id=user.id,
        role="assistant",
        body=answer.text,
        actions=actions,
        model=llm.model,
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
    )
    db.add(saved)
    await db.flush()
    await db.refresh(saved)

    # This person's other tabs, so the thread is the same everywhere. Delivered
    # only if the transaction commits -- see app/services/events.py.
    await publish(
        db,
        to=[user.id],
        type="assistant",
        data={"message_id": str(saved.id)},
    )
    logger.info(
        "assistant: reply to %s (tokens in=%s out=%s, %s action(s))",
        user.id,
        usage["input_tokens"],
        usage["output_tokens"],
        len(actions),
    )
    return saved
