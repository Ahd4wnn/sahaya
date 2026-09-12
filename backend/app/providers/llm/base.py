"""The language-model interface Ask Sahaya talks to.

Narrow on purpose: one call that takes instructions, a transcript and a set of
tools, and returns either text or tool calls. Everything that makes the
assistant useful -- what the tools are, what they may do, what the reply is
allowed to claim -- lives in app/services/assistant, above this line. Swapping
provider should never be able to change any of that.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal


class LlmError(Exception):
    """The model could not be reached, or answered with something unusable.

    Always carries a sentence fit to show a person: the API layer passes it
    straight through as the 503 body, the way the rest of Sahaya does.
    """


@dataclass(frozen=True)
class LlmMessage:
    """One turn. `tool_call_id` is set on tool results only."""

    role: Literal["user", "assistant", "tool"]
    content: str
    tool_call_id: str = ""
    #: For an assistant turn that asked for tools, the calls it made -- the
    #: provider needs them echoed back alongside their results.
    tool_calls: tuple["LlmToolCall", ...] = ()


@dataclass(frozen=True)
class LlmToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class LlmReply:
    text: str = ""
    tool_calls: tuple[LlmToolCall, ...] = ()
    #: `{"input_tokens": n, "output_tokens": n}` when the provider reports it.
    usage: dict[str, int] = field(default_factory=dict)


class Llm(ABC):
    #: Whether this provider can actually be called. False is a normal state,
    #: not a fault: it is what an unconfigured install looks like, and every
    #: surface checks it before offering the assistant at all.
    available: bool = False
    model: str = ""

    @abstractmethod
    async def respond(
        self,
        *,
        instructions: str,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]],
        max_output_tokens: int,
    ) -> LlmReply:
        """One round trip. Raises LlmError on anything it cannot return."""
