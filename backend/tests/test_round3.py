"""Round 3: admin-managed skills, and Ask Sahaya.

The assistant is tested against a stub model, never the network. That is not
only about speed and cost: the properties worth pinning down here are ours, not
OpenAI's -- that a failed call stores nothing, that the daily cap holds, that a
proposal for an unlisted helper is dropped, and that no tool can leak a phone
number. A real model would make every one of those tests flaky.
"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, func, select

from app.models.enums import Shift, UserRole
from app.models.marketplace import HelperProfile
from app.models.messaging import AssistantMessage
from app.models.taxonomy import HelperSkill, Skill
from app.models.user import AdminAction, User
from app.providers.llm.base import Llm, LlmError, LlmMessage, LlmReply, LlmToolCall
from app.services.assistant import runner, tools
from tests.test_round2 import person, subscribe

pytestmark = pytest.mark.asyncio


# --------------------------------------------------------------------------- #
# skills
# --------------------------------------------------------------------------- #
async def test_archived_skills_leave_the_taxonomy_and_every_change_is_audited(
    db, clean_user, client
):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    slug = f"test_{uuid.uuid4().hex[:8]}"
    try:
        r = await client.post(
            "/api/v1/admin/skills",
            json={"slug": slug, "name": "Test Skill", "name_ml": "പരീക്ഷണം"},
            headers=as_admin,
        )
        assert r.status_code == 201
        skill_id = r.json()["id"]
        assert r.json()["helper_count"] == 0

        taxonomy = (await client.get("/api/v1/taxonomy")).json()
        [shown] = [s for s in taxonomy["skills"] if s["slug"] == slug]
        assert shown["name"] == "Test Skill"

        # The slug is immutable, and saying so beats silently ignoring it.
        r = await client.patch(
            f"/api/v1/admin/skills/{skill_id}", json={"slug": "renamed"}, headers=as_admin
        )
        assert r.status_code == 422

        r = await client.patch(
            f"/api/v1/admin/skills/{skill_id}", json={"is_active": False}, headers=as_admin
        )
        assert r.status_code == 200

        taxonomy = (await client.get("/api/v1/taxonomy")).json()
        assert slug not in {s["slug"] for s in taxonomy["skills"]}
        admin_list = (await client.get("/api/v1/admin/skills", headers=as_admin)).json()
        assert slug in {s["slug"] for s in admin_list}

        actions = (
            (
                await db.execute(
                    select(AdminAction.action).where(
                        AdminAction.target_id == uuid.UUID(skill_id)
                    )
                )
            )
            .scalars()
            .all()
        )
        assert set(actions) == {"skill.create", "skill.archive"}
    finally:
        await db.execute(delete(Skill).where(Skill.slug == slug))
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()


async def test_reordering_skills_needs_every_skill_exactly_once(db, clean_user, client):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    try:
        existing = (await client.get("/api/v1/admin/skills", headers=as_admin)).json()
        assert len(existing) > 1

        # A partial order is refused: silently renumbering the ids it was given
        # would leave the rest in an order nobody chose.
        r = await client.post(
            "/api/v1/admin/skills/reorder",
            json={"ids": [existing[0]["id"]]},
            headers=as_admin,
        )
        assert r.status_code == 400

        ids = [s["id"] for s in existing]
        flipped = [ids[1], ids[0], *ids[2:]]
        r = await client.post(
            "/api/v1/admin/skills/reorder", json={"ids": flipped}, headers=as_admin
        )
        assert r.status_code == 200
        assert [s["id"] for s in r.json()] == flipped
        assert [s["sort_order"] for s in r.json()][:2] == [10, 20]
    finally:
        # Put the seeded order back, so a later run of the suite is unchanged.
        await client.post(
            "/api/v1/admin/skills/reorder",
            json={"ids": [s["id"] for s in existing]},
            headers=as_admin,
        )
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()


async def test_a_helper_keeps_an_archived_skill_but_nobody_new_can_choose_it(
    db, clean_user, client
):
    admin, _, as_admin = await person(db, clean_user, UserRole.ADMIN)
    _, mine, as_mine = await person(db, clean_user, UserRole.HELPER, subscribed=True)
    _, _, as_other = await person(db, clean_user, UserRole.HELPER, subscribed=True)
    slug = f"test_{uuid.uuid4().hex[:8]}"
    try:
        skill_id = (
            await client.post(
                "/api/v1/admin/skills",
                json={"slug": slug, "name": "Doomed Skill"},
                headers=as_admin,
            )
        ).json()["id"]

        r = await client.patch(
            "/api/v1/helpers/me", json={"skills": [slug]}, headers=as_mine
        )
        assert r.status_code == 200
        assert [s["slug"] for s in r.json()["skills"]] == [slug]

        await client.patch(
            f"/api/v1/admin/skills/{skill_id}", json={"is_active": False}, headers=as_admin
        )

        # The helper who already had it can still save their profile...
        r = await client.patch(
            "/api/v1/helpers/me", json={"skills": [slug]}, headers=as_mine
        )
        assert r.status_code == 200
        # ...and nobody else can add it.
        r = await client.patch(
            "/api/v1/helpers/me", json={"skills": [slug]}, headers=as_other
        )
        assert r.status_code == 400
        assert "Doomed Skill" in r.json()["detail"]
    finally:
        await db.execute(
            delete(HelperSkill).where(HelperSkill.skill_id == uuid.UUID(skill_id))
        )
        await db.execute(delete(Skill).where(Skill.slug == slug))
        await db.execute(delete(AdminAction).where(AdminAction.admin_id == admin.id))
        await db.commit()


# --------------------------------------------------------------------------- #
# ask sahaya
# --------------------------------------------------------------------------- #
class StubLlm(Llm):
    """A scripted model. Each element is a reply to return or an error to raise."""

    available = True
    model = "stub-model"

    def __init__(self, *script):
        self.script = list(script)
        self.seen: list[dict] = []

    async def respond(self, **kwargs):
        self.seen.append(kwargs)
        step = self.script.pop(0) if self.script else LlmReply(text="(no script left)")
        if isinstance(step, Exception):
            raise step
        return step


def use_model(monkeypatch, llm) -> None:
    """Point both the runner and the route at this model."""
    monkeypatch.setattr("app.services.assistant.runner.get_llm", lambda: llm)
    monkeypatch.setattr("app.api.v1.assistant.get_llm", lambda: llm)


async def turn_count(db, user_id) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(AssistantMessage)
            .where(AssistantMessage.user_id == user_id)
        )
    ).scalar_one()


async def test_the_assistant_is_hidden_until_a_key_is_configured(db, clean_user, client):
    """An install with no key must look finished, not broken."""
    from app.providers.llm.disabled import DisabledLlm

    user, _, headers = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    with pytest.MonkeyPatch.context() as monkeypatch:
        use_model(monkeypatch, DisabledLlm())

        thread = (await client.get("/api/v1/me/assistant", headers=headers)).json()
        assert thread["enabled"] is False
        assert thread["messages"] == []

        r = await client.post(
            "/api/v1/me/assistant/messages", json={"body": "hello"}, headers=headers
        )
        assert r.status_code == 503
        assert "OPENAI_API_KEY" in r.json()["detail"]

    assert await turn_count(db, user.id) == 0


async def test_the_assistant_searches_then_proposes_a_message(db, clean_user, client):
    hirer, _, as_hirer = await person(
        db, clean_user, UserRole.HIRER, subscribed=True, name="Asha Family"
    )
    helper, profile, _ = await person(
        db, clean_user, UserRole.HELPER, subscribed=True, name="Sumitra Cook"
    )

    llm = StubLlm(
        LlmReply(
            tool_calls=(
                LlmToolCall(id="c1", name="search_helpers", arguments={"q": "Sumitra Cook"}),
            ),
            usage={"input_tokens": 100, "output_tokens": 20},
        ),
        LlmReply(
            tool_calls=(
                LlmToolCall(
                    id="c2",
                    name="propose_message_helper",
                    arguments={
                        "helper_profile_id": str(profile.id),
                        "message": "Hello, we need a cook in Kochi from Monday.",
                    },
                ),
            ),
            usage={"input_tokens": 140, "output_tokens": 30},
        ),
        LlmReply(
            text="Sumitra Cook looks right. I have written a first message for you.",
            usage={"input_tokens": 160, "output_tokens": 25},
        ),
    )

    try:
        with pytest.MonkeyPatch.context() as monkeypatch:
            use_model(monkeypatch, llm)
            r = await client.post(
                "/api/v1/me/assistant/messages",
                json={"body": "I need a cook in Kochi"},
                headers=as_hirer,
            )
        assert r.status_code == 201
        body = r.json()
        assert body["question"]["body"] == "I need a cook in Kochi"
        assert "Sumitra Cook" in body["answer"]["body"]

        [action] = body["answer"]["actions"]
        assert action["kind"] == "message_helper"
        assert action["helper_profile_id"] == str(profile.id)
        assert action["helper_name"] == "Sumitra Cook"
        assert action["draft"].startswith("Hello, we need a cook")

        # Cost is recorded, not estimated.
        saved = await db.get(AssistantMessage, uuid.UUID(body["answer"]["id"]))
        assert saved.model == "stub-model"
        assert saved.input_tokens == 400
        assert saved.output_tokens == 75

        # The tool result the model saw carried the helper, and no way to reach
        # them off-platform.
        search_round = llm.seen[1]
        transcript = " ".join(m.content for m in search_round["messages"])
        assert "Sumitra Cook" in transcript
        assert helper.phone not in transcript

        thread = (await client.get("/api/v1/me/assistant", headers=as_hirer)).json()
        assert [t["role"] for t in thread["messages"]] == ["user", "assistant"]
        assert thread["remaining_today"] == thread["daily_limit"] - 1
    finally:
        await db.execute(
            delete(AssistantMessage).where(AssistantMessage.user_id == hirer.id)
        )
        await db.commit()


async def test_a_helper_is_never_offered_the_messaging_tool():
    """Families start conversations on Sahaya, so the tool is absent rather
    than present-and-refused for everybody else."""
    for_family = {t["name"] for t in tools.tool_schemas(can_message=True)}
    for_helper = {t["name"] for t in tools.tool_schemas(can_message=False)}
    assert "propose_message_helper" in for_family
    assert "propose_message_helper" not in for_helper
    assert {"search_helpers", "resolve_place", "get_my_context"} <= for_helper


async def test_a_proposal_for_an_unlisted_helper_is_dropped(db, clean_user):
    """The model's id is re-validated, so a stale or hallucinated one cannot
    become a button."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    _, profile, _ = await person(db, clean_user, UserRole.HELPER, subscribed=True)
    user = await db.get(User, hirer.id)

    ok = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c1",
            name="propose_message_helper",
            arguments={"helper_profile_id": str(profile.id), "message": "Hello there"},
        ),
    )
    assert ok.actions and ok.output["proposed"] is True

    # Through the ORM, so the instance the tool loads is the unlisted one --
    # a Core UPDATE would leave this session's copy still saying listed.
    profile = await db.get(HelperProfile, profile.id)
    profile.is_listed = False
    await db.flush()

    dropped = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c2",
            name="propose_message_helper",
            arguments={"helper_profile_id": str(profile.id), "message": "Hello there"},
        ),
    )
    assert dropped.actions == []
    assert "not listed" in dropped.output["error"]

    invented = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c3",
            name="propose_message_helper",
            arguments={"helper_profile_id": str(uuid.uuid4()), "message": "Hello"},
        ),
    )
    assert invented.actions == []
    assert "error" in invented.output


async def test_search_results_carry_no_contact_details(db, clean_user):
    """The paywall cannot be talked past: the model is never shown a number."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    helper, profile, _ = await person(
        db, clean_user, UserRole.HELPER, subscribed=True, name="Fathima Nurse"
    )
    helper = await db.get(User, helper.id)
    helper.email = f"test-{uuid.uuid4().hex[:8]}@sahaya.test"
    await db.flush()

    result = await tools.execute(
        db,
        await db.get(User, hirer.id),
        LlmToolCall(id="c1", name="search_helpers", arguments={"q": "Fathima Nurse"}),
    )
    import json

    payload = json.dumps(result.output)
    assert "Fathima Nurse" in payload
    assert helper.phone not in payload
    assert helper.email not in payload
    assert "phone" not in payload


async def test_a_model_failure_leaves_no_half_conversation(db, clean_user, client):
    user, _, headers = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    llm = StubLlm(LlmError("Ask Sahaya could not be reached just now. Try again."))

    with pytest.MonkeyPatch.context() as monkeypatch:
        use_model(monkeypatch, llm)
        r = await client.post(
            "/api/v1/me/assistant/messages",
            json={"body": "are you there?"},
            headers=headers,
        )
    assert r.status_code == 503
    assert "Try again" in r.json()["detail"]
    # The question is rolled back with the failed answer: the client still has
    # the text, so a retry cannot ask the same thing twice.
    assert await turn_count(db, user.id) == 0


async def test_the_daily_cap_holds_and_start_over_does_not_reset_it(
    db, clean_user, client
):
    user, _, headers = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    llm = StubLlm(
        LlmReply(text="First answer."),
        LlmReply(text="Second answer."),
    )
    try:
        with pytest.MonkeyPatch.context() as monkeypatch:
            use_model(monkeypatch, llm)
            monkeypatch.setattr(
                "app.services.assistant.runner.settings.ASSISTANT_DAILY_MESSAGE_LIMIT", 1
            )

            r = await client.post(
                "/api/v1/me/assistant/messages", json={"body": "one"}, headers=headers
            )
            assert r.status_code == 201
            assert r.json()["remaining_today"] == 0

            r = await client.post(
                "/api/v1/me/assistant/messages", json={"body": "two"}, headers=headers
            )
            assert r.status_code == 429
            assert "resets" in r.json()["detail"]

            # Start over hides the conversation without buying more messages.
            assert (
                await client.post("/api/v1/me/assistant/reset", headers=headers)
            ).status_code == 204

            thread = (await client.get("/api/v1/me/assistant", headers=headers)).json()
            assert thread["messages"] == []

            r = await client.post(
                "/api/v1/me/assistant/messages", json={"body": "three"}, headers=headers
            )
            assert r.status_code == 429
    finally:
        await db.execute(
            delete(AssistantMessage).where(AssistantMessage.user_id == user.id)
        )
        await db.commit()


async def test_the_assistant_knows_this_persons_own_situation(db, clean_user):
    """get_my_context is what lets it answer "why can't I message her?"."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER)
    user = await db.get(User, hirer.id)

    lapsed = await tools.execute(
        db, user, LlmToolCall(id="c1", name="get_my_context", arguments={})
    )
    assert lapsed.output["account_type"] == "family"
    assert lapsed.output["membership_active"] is False

    await subscribe(db, user)
    await db.flush()
    live = await tools.execute(
        db, user, LlmToolCall(id="c2", name="get_my_context", arguments={})
    )
    assert live.output["membership_active"] is True
    assert live.output["membership_until"] > datetime.now(UTC).date().isoformat()


async def test_an_unknown_tool_is_an_answer_not_a_crash(db, clean_user):
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER)
    result = await tools.execute(
        db,
        await db.get(User, hirer.id),
        LlmToolCall(id="c1", name="delete_everything", arguments={}),
    )
    assert "error" in result.output


async def test_the_tool_loop_is_bounded(db, clean_user, client):
    """A model that only ever asks for tools still has to answer in the end."""
    user, _, headers = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    forever = [
        LlmReply(
            tool_calls=(LlmToolCall(id=f"c{i}", name="get_my_context", arguments={}),)
        )
        for i in range(runner.MAX_TOOL_ROUNDS)
    ]
    llm = StubLlm(*forever, LlmReply(text="Here is what I found."))
    try:
        with pytest.MonkeyPatch.context() as monkeypatch:
            use_model(monkeypatch, llm)
            r = await client.post(
                "/api/v1/me/assistant/messages", json={"body": "hello"}, headers=headers
            )
        assert r.status_code == 201
        assert r.json()["answer"]["body"] == "Here is what I found."
        # The last call had the tools withdrawn, so it could not ask again.
        assert llm.seen[-1]["tools"] == []
    finally:
        await db.execute(
            delete(AssistantMessage).where(AssistantMessage.user_id == user.id)
        )
        await db.commit()


# --------------------------------------------------------------------------- #
# the wire, against a stand-in for OpenAI
# --------------------------------------------------------------------------- #
async def test_the_openai_request_and_reply_shapes(monkeypatch):
    """Pin the one thing a stubbed model cannot check: what actually goes on
    the wire, and what we make of what comes back.

    A tiny HTTP server stands in for api.openai.com, so this runs offline and
    a typo in a field name fails here rather than the first time a real key is
    pasted in.
    """
    import json as jsonlib
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from app.providers.llm.openai_impl import OpenAiLlm

    received: dict = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            received["body"] = jsonlib.loads(self.rfile.read(length))
            received["auth"] = self.headers.get("Authorization")
            payload = {
                "id": "resp_test",
                "status": "completed",
                "output": [
                    {"type": "reasoning", "summary": []},
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "Two cooks near you."}],
                    },
                    {
                        "type": "function_call",
                        "call_id": "call_42",
                        "name": "search_helpers",
                        "arguments": '{"district": "ernakulam"}',
                    },
                ],
                "usage": {"input_tokens": 321, "output_tokens": 45},
            }
            body = jsonlib.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setattr(
        "app.providers.llm.openai_impl.ENDPOINT",
        f"http://127.0.0.1:{server.server_port}/v1/responses",
    )
    monkeypatch.setattr("app.core.config.settings.OPENAI_API_KEY", "sk-test-not-a-real-key")

    try:
        llm = OpenAiLlm()
        assert llm.available is True

        reply = await llm.respond(
            instructions="You are Ask Sahaya.",
            messages=[
                LlmMessage(role="user", content="I need a cook in Kochi"),
                LlmMessage(
                    role="assistant",
                    content="",
                    tool_calls=(
                        LlmToolCall(id="call_1", name="resolve_place", arguments={"text": "Kochi"}),
                    ),
                ),
                LlmMessage(role="tool", tool_call_id="call_1", content='{"districts": []}'),
            ],
            tools=tools.tool_schemas(can_message=True),
            max_output_tokens=700,
        )
    finally:
        server.shutdown()

    sent = received["body"]
    assert received["auth"] == "Bearer sk-test-not-a-real-key"
    assert sent["model"] == "gpt-5-nano"
    assert sent["instructions"] == "You are Ask Sahaya."
    assert sent["max_output_tokens"] == 700
    # Low reasoning effort is load-bearing: at a higher one the token ceiling
    # can be spent thinking, and the reply comes back empty.
    assert sent["reasoning"] == {"effort": "low"}
    # Function tools are flat in the Responses API -- not nested under "function".
    assert {t["type"] for t in sent["tools"]} == {"function"}
    assert "search_helpers" in {t["name"] for t in sent["tools"]}

    # A tool round trip: the call and its result, keyed to each other.
    kinds = [item.get("type") or f"role:{item['role']}" for item in sent["input"]]
    assert kinds == ["role:user", "function_call", "function_call_output"]
    assert sent["input"][1]["call_id"] == sent["input"][2]["call_id"] == "call_1"
    assert jsonlib.loads(sent["input"][1]["arguments"]) == {"text": "Kochi"}

    assert reply.text == "Two cooks near you."
    [call] = reply.tool_calls
    assert (call.id, call.name, call.arguments) == (
        "call_42",
        "search_helpers",
        {"district": "ernakulam"},
    )
    assert reply.usage == {"input_tokens": 321, "output_tokens": 45}


async def test_an_empty_model_reply_is_an_error_not_an_empty_bubble(monkeypatch):
    """`status: incomplete` with no text means the ceiling was spent on
    reasoning. Showing that as a blank bubble would look like a broken app."""
    from app.providers.llm.openai_impl import _parse

    with pytest.raises(LlmError):
        _parse(
            {
                "id": "resp_x",
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output": [{"type": "reasoning", "summary": []}],
            }
        )


async def test_a_proposal_can_name_the_helper_instead_of_holding_an_id(db, clean_user):
    """Tool results are not replayed into the next turn, so the model does not
    remember a UUID -- and asking a family to paste one is not acceptable. The
    name it wrote is enough; the server does the resolving."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    unique = f"Meenakshi {uuid.uuid4().hex[:6]}"
    _, profile, _ = await person(
        db, clean_user, UserRole.HELPER, subscribed=True, name=unique
    )
    user = await db.get(User, hirer.id)

    by_name = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c1",
            name="propose_message_helper",
            arguments={"helper_name": unique, "message": "Hello, are you free from Monday?"},
        ),
    )
    [action] = by_name.actions
    assert action["helper_profile_id"] == str(profile.id)

    # A partial name still resolves, and a rubbish id falls back to the name
    # rather than giving up on a proposal the model clearly meant.
    partial = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c2",
            name="propose_message_helper",
            arguments={
                "helper_profile_id": "not-a-uuid",
                "helper_name": unique.split()[1],
                "message": "Hello",
            },
        ),
    )
    assert partial.actions and partial.actions[0]["helper_profile_id"] == str(profile.id)

    missing = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c3",
            name="propose_message_helper",
            arguments={"helper_name": "Nobody Listed Here", "message": "Hello"},
        ),
    )
    assert missing.actions == [] and "No listed helper" in missing.output["error"]


async def test_an_over_filtered_search_broadens_itself(db, clean_user):
    """gpt-5-nano fills in every parameter it is offered. A shift and a
    live-in flag nobody asked for used to turn a good search into an empty
    one, and the model then told the family there was nobody."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    user = await db.get(User, hirer.id)
    name = f"Ammini {uuid.uuid4().hex[:6]}"
    _, profile, _ = await person(db, clean_user, UserRole.HELPER, subscribed=True, name=name)

    profile = await db.get(HelperProfile, profile.id)
    profile.willing_to_live_in = True
    profile.shifts = [Shift.MORNING]
    profile.wage_monthly_min = 14_000_00
    profile.wage_monthly_max = 18_000_00
    await db.flush()

    # The exact shape the live model sent: filters the family never mentioned.
    result = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c1",
            name="search_helpers",
            arguments={
                "q": name,
                "live_in": False,  # the old parameter name: no longer a filter
                "shift": "full_day",  # invented, and wrong for this helper
                "wage_max_rupees": 15000,
                "town": "",
                "sort": "wage_low",
                "limit": 4,
            },
        ),
    )
    assert [h["name"] for h in result.output["helpers"]] == [name]
    assert "do not say you found nobody" in result.output["note"]
    # Dropping the shift is admitted, so the reply can say what it widened.
    assert "broader search" in result.output["note"]

    # live_in_required=true is still a real filter.
    strict = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c2",
            name="search_helpers",
            arguments={"q": name, "live_in_required": True},
        ),
    )
    assert [h["name"] for h in strict.output["helpers"]] == [name]


async def test_a_place_that_is_not_a_place_is_dropped_with_a_note(db, clean_user):
    """"Kochi" is a town, not a district; the model sent it as both. Matching
    zero rows silently was the worst of the three possible behaviours."""
    hirer, _, _ = await person(db, clean_user, UserRole.HIRER, subscribed=True)
    user = await db.get(User, hirer.id)

    result = await tools.execute(
        db,
        user,
        LlmToolCall(
            id="c1", name="search_helpers", arguments={"district": "Kochi", "service": "cook"}
        ),
    )
    assert "not a place on Sahaya" in result.output["note"]

    # A district by its English name resolves rather than being dropped.
    named = await tools.execute(
        db,
        user,
        LlmToolCall(id="c2", name="search_helpers", arguments={"district": "Ernakulam"}),
    )
    assert "not a place" not in named.output["note"]


# --------------------------------------------------------------------------- #
# portraits
# --------------------------------------------------------------------------- #
def _subject_on_transparent(canvas, box):
    """A silhouette inside an otherwise empty frame, like a real cutout."""
    from PIL import Image, ImageDraw

    image = Image.new("RGBA", canvas, (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse(box, fill=(90, 60, 40, 255))
    buffer = __import__("io").BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


async def test_a_cutout_is_framed_on_the_subject_not_the_camera_frame():
    """The card draws a 145px square with object-top, so a subject sitting low
    in a tall frame rendered as a small head in a mostly empty box. This is the
    exact shape of the first real upload: 768x1024, subject starting 355 down."""
    import io

    from PIL import Image

    from app.providers.imaging.base import PORTRAIT_EDGE, Imaging

    raw = _subject_on_transparent((768, 1024), (200, 355, 560, 1000))
    framed = Imaging.frame_subject(raw)

    with Image.open(io.BytesIO(framed)) as image:
        assert image.size == (PORTRAIT_EDGE, PORTRAIT_EDGE)  # square: the card cannot re-crop it
        alpha = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
        box = alpha.getbbox()

    # The subject now starts near the top, with headroom -- not 35% of the way down.
    assert box is not None
    assert 0 < box[1] < PORTRAIT_EDGE * 0.2
    # And it fills the frame horizontally rather than hiding in a corner.
    assert (box[2] - box[0]) > PORTRAIT_EDGE * 0.8


async def test_framing_survives_the_awkward_cases():
    import io

    from PIL import Image

    from app.providers.imaging.base import PORTRAIT_EDGE, Imaging

    # Nothing opaque: returned untouched, for alpha_is_plausible to reject.
    empty = _subject_on_transparent((400, 400), (0, 0, 0, 0))
    assert Imaging.frame_subject(empty) == empty

    # A subject touching every edge is padded, not squashed off-centre.
    edge_to_edge = _subject_on_transparent((400, 400), (0, 0, 399, 399))
    with Image.open(io.BytesIO(Imaging.frame_subject(edge_to_edge))) as image:
        assert image.size == (PORTRAIT_EDGE, PORTRAIT_EDGE)

    # A wide subject (arms out) must not produce a square taller than the person.
    wide = _subject_on_transparent((900, 500), (20, 150, 880, 400))
    with Image.open(io.BytesIO(Imaging.frame_subject(wide))) as image:
        assert image.size == (PORTRAIT_EDGE, PORTRAIT_EDGE)
        assert image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox() is not None
