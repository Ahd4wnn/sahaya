"""OpenAI, over the Responses API, with httpx.

httpx is already a dependency (Google token verification uses it), so this adds
no package. The SDK would be a second HTTP stack and a second retry policy in
the process for the sake of one endpoint.

Two things here are not incidental:

* **Reasoning effort is pinned low.** On the gpt-5 family reasoning tokens are
  spent out of `max_output_tokens`. At a default effort a small ceiling can be
  consumed entirely by thinking, and the call returns `status: "incomplete"`
  with no text at all -- which looks exactly like a broken assistant. Low
  effort is also the right shape for the job: short answers over a search tool.
* **An incomplete answer is an error, not an empty reply.** Returning "" would
  show a person an empty bubble; raising lets the route answer 503 and the
  client offer a retry with their text intact.
"""

import asyncio
import json
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.providers.llm.base import Llm, LlmError, LlmMessage, LlmReply, LlmToolCall

logger = logging.getLogger("sahaya.assistant")

ENDPOINT = "https://api.openai.com/v1/responses"
#: One retry, on the two failures that are worth retrying. Anything else is a
#: request problem and retrying it just doubles the latency before the error.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def _to_input(messages: list[LlmMessage]) -> list[dict[str, Any]]:
    """Our transcript in the Responses API's own shape."""
    items: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "tool":
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id,
                    "output": message.content,
                }
            )
            continue

        if message.role == "assistant" and message.tool_calls:
            # The calls have to be echoed back beside their results, or the
            # model is shown answers to questions it cannot see it asked.
            if message.content:
                items.append({"role": "assistant", "content": message.content})
            for call in message.tool_calls:
                items.append(
                    {
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    }
                )
            continue

        items.append({"role": message.role, "content": message.content})
    return items


def _parse(payload: dict[str, Any]) -> LlmReply:
    text_parts: list[str] = []
    calls: list[LlmToolCall] = []

    for item in payload.get("output") or []:
        kind = item.get("type")
        if kind == "message":
            for part in item.get("content") or []:
                if part.get("type") == "output_text" and part.get("text"):
                    text_parts.append(str(part["text"]))
        elif kind == "function_call":
            raw = item.get("arguments") or "{}"
            try:
                arguments = json.loads(raw)
            except json.JSONDecodeError:
                # A malformed argument object is the model's mistake, not a
                # transport failure; an empty dict lets the tool reject it and
                # tell the model what was wrong.
                arguments = {}
            if not isinstance(arguments, dict):
                arguments = {}
            calls.append(
                LlmToolCall(
                    id=str(item.get("call_id") or item.get("id") or ""),
                    name=str(item.get("name") or ""),
                    arguments=arguments,
                )
            )

    text = "\n\n".join(text_parts).strip()
    if not text and not calls:
        reason = (payload.get("incomplete_details") or {}).get("reason", "")
        logger.warning(
            "assistant: empty response (status=%s reason=%s id=%s)",
            payload.get("status"),
            reason,
            payload.get("id"),
        )
        raise LlmError("Ask Sahaya could not finish that answer. Try again.")

    usage = payload.get("usage") or {}
    return LlmReply(
        text=text,
        tool_calls=tuple(calls),
        usage={
            "input_tokens": int(usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("output_tokens") or 0),
        },
    )


class OpenAiLlm(Llm):
    def __init__(self) -> None:
        self._key = settings.OPENAI_API_KEY.strip()
        self.available = bool(self._key)
        self.model = settings.ASSISTANT_MODEL

    async def respond(
        self,
        *,
        instructions: str,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]],
        max_output_tokens: int,
    ) -> LlmReply:
        if not self.available:
            raise LlmError(
                "Ask Sahaya is not switched on yet. Add OPENAI_API_KEY to "
                "backend/.env and restart the server."
            )

        body: dict[str, Any] = {
            "model": self.model,
            "instructions": instructions,
            "input": _to_input(messages),
            "max_output_tokens": max_output_tokens,
            "reasoning": {"effort": "low"},
        }
        if tools:
            body["tools"] = tools

        timeout = httpx.Timeout(settings.ASSISTANT_TIMEOUT_SECONDS)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in (1, 2):
                try:
                    response = await client.post(
                        ENDPOINT,
                        json=body,
                        headers={
                            "Authorization": f"Bearer {self._key}",
                            "Content-Type": "application/json",
                        },
                    )
                except httpx.TimeoutException:
                    if attempt == 1:
                        continue
                    raise LlmError(
                        "Ask Sahaya took too long to answer. Try again."
                    ) from None
                except httpx.HTTPError as exc:
                    logger.warning("assistant: transport error: %s", exc)
                    raise LlmError(
                        "Ask Sahaya could not be reached just now. Try again."
                    ) from None

                if response.status_code in RETRY_STATUSES and attempt == 1:
                    await asyncio.sleep(1.0)
                    continue
                break

        if response.status_code >= 400:
            # The provider's own message goes to the log, never to the person:
            # it can quote request internals, and it is written for us.
            logger.warning(
                "assistant: %s from OpenAI: %s",
                response.status_code,
                response.text[:500],
            )
            if response.status_code == 429:
                raise LlmError("Ask Sahaya is busy right now. Try again in a moment.")
            raise LlmError("Ask Sahaya could not answer that just now. Try again.")

        try:
            payload = response.json()
        except ValueError:
            raise LlmError("Ask Sahaya sent back something unreadable.") from None

        reply = _parse(payload)
        logger.info(
            "assistant: model=%s in=%s out=%s tools=%s",
            self.model,
            reply.usage.get("input_tokens"),
            reply.usage.get("output_tokens"),
            [c.name for c in reply.tool_calls],
        )
        return reply
