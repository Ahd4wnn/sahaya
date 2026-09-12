"""The provider used when no key is configured.

It exists so nothing above has to special-case a missing key: the assistant is
always constructed, always asked whether it is `available`, and the answer is
simply no. The message is the one a person sees in the 503.
"""

from typing import Any

from app.providers.llm.base import Llm, LlmError, LlmMessage, LlmReply

REASON = (
    "Ask Sahaya is not switched on yet. Add OPENAI_API_KEY to backend/.env and "
    "restart the server."
)


class DisabledLlm(Llm):
    available = False
    model = ""

    async def respond(
        self,
        *,
        instructions: str,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]],
        max_output_tokens: int,
    ) -> LlmReply:
        raise LlmError(REASON)
