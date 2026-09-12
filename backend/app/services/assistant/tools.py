"""The four things Ask Sahaya can do, and the limits on each.

Three read, one proposes. None of them writes anything: the assistant's only
route to an action is a card the person taps, and that tap goes through the
ordinary messaging endpoints with their ordinary rules -- roles, membership,
blocking, everything. So the worst a confused model can do here is show
somebody an unhelpful list or a draft they do not send.

`search_helpers` calls app.services.listings.search_profiles, which is the
same function GET /helpers calls. That is the point: a second copy of "who is
listed" would eventually disagree with the front page, and the disagreement
would be invisible.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select

from app.api.deps import has_active_subscription
from app.models.billing import Subscription
from app.models.engagement import Favorite
from app.models.enums import (
    ACTIVE_SUBSCRIPTION_STATUSES,
    HireRequestStatus,
    Shift,
    UserRole,
    VerificationStatus,
)
from app.models.geo import District, Town
from app.models.marketplace import HelperProfile, HireRequest
from app.models.messaging import Conversation
from app.models.taxonomy import HelperSkill, Service
from app.models.user import User
from app.providers.llm.base import LlmToolCall
from app.services.listings import search_profiles

#: A chat bubble, not a results page.
MAX_RESULTS = 6
#: Per assistant turn. More cards than this is a page, and a model that wants
#: to propose eight messages has misread the conversation.
MAX_ACTIONS = 3
MAX_DRAFT = 600

SORTS = ("rating", "wage_low", "wage_high", "newest")


@dataclass
class ToolResult:
    """What the model is shown, plus anything the person may act on."""

    output: dict[str, Any]
    actions: list[dict[str, Any]] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# schemas
# --------------------------------------------------------------------------- #
def tool_schemas(*, can_message: bool) -> list[dict[str, Any]]:
    """The tools this person's assistant may call.

    `propose_message_helper` is simply absent for a helper or an admin, rather
    than present and refused: a tool the model cannot use is a tool it cannot
    be talked into trying.
    """
    schemas: list[dict[str, Any]] = [
        {
            "type": "function",
            "name": "search_helpers",
            "description": (
                "Search listed helpers. Returns the same people the site's own "
                "search returns, best-rated first unless told otherwise. Wages "
                "are in rupees per month. Send ONLY the filters the family "
                "actually asked for -- every extra one excludes people."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "district": {
                        "type": "string",
                        "description": "District slug, e.g. ernakulam. Use resolve_place if unsure.",
                    },
                    "town": {"type": "string", "description": "Town slug, optional."},
                    "service": {
                        "type": "string",
                        "description": "Service slug: the helper's main role, e.g. cook.",
                    },
                    "skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Skill slugs. ALL of them must be present on a helper.",
                    },
                    "live_in_required": {
                        "type": "boolean",
                        "description": (
                            "Pass true ONLY if the family said the helper must live "
                            "in. Leave it out otherwise: false is not a filter."
                        ),
                    },
                    "shift": {
                        "type": "string",
                        "enum": [s.value for s in Shift],
                        "description": (
                            "Only when the family named the hours they need. Leave "
                            "it out otherwise -- it excludes everyone else."
                        ),
                    },
                    "wage_max_rupees": {
                        "type": "integer",
                        "description": "Highest monthly wage the family can pay, in rupees.",
                    },
                    "q": {
                        "type": "string",
                        "description": "Free text matched against name and headline.",
                    },
                    "sort": {"type": "string", "enum": list(SORTS)},
                    "limit": {
                        "type": "integer",
                        "description": f"1 to {MAX_RESULTS}. Default 4.",
                    },
                },
                "required": [],
            },
        },
        {
            "type": "function",
            "name": "resolve_place",
            "description": (
                "Turn a place somebody typed -- 'Kochi', 'Calicut', a Malayalam "
                "name, a neighbourhood -- into district and town slugs."
            ),
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
            },
        },
        {
            "type": "function",
            "name": "get_my_context",
            "description": (
                "This person's own situation: account type, whether their Rs 99 "
                "membership is live, and their listing or hire requests. Call it "
                "before answering anything about what they can or cannot do."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    ]

    if can_message:
        schemas.append(
            {
                "type": "function",
                "name": "propose_message_helper",
                "description": (
                    "Offer the family a button that opens a chat with one helper, "
                    "with a first message already written. It does NOT send "
                    "anything -- they tap it themselves. Identify the helper by "
                    "name (or by helper_profile_id if you have one to hand); "
                    "never ask the family for an id."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "helper_name": {
                            "type": "string",
                            "description": "The helper's name, as you listed it.",
                        },
                        "helper_profile_id": {
                            "type": "string",
                            "description": "Optional, when you have it from this turn's search.",
                        },
                        "message": {
                            "type": "string",
                            "description": (
                                "The draft, in the family's voice: who they are, "
                                "what they need, where, and when. Two or three "
                                "sentences."
                            ),
                        },
                    },
                    "required": ["message"],
                },
            }
        )
    return schemas


# --------------------------------------------------------------------------- #
# executors
# --------------------------------------------------------------------------- #
def _rupees(paise: int) -> int:
    return round(paise / 100)


def _card_for_model(card: Any) -> dict[str, Any]:
    """A helper, as the model should see one.

    No photo URLs (it cannot look at them) and no contact details at all --
    those are the paywall, and a paywall that a language model can talk its way
    past is not a paywall.
    """
    return {
        "helper_profile_id": str(card.id),
        "name": card.full_name,
        "service": card.service_name,
        "headline": card.headline,
        "skills": [s.name for s in card.skills],
        "experience_years": card.experience_years,
        "wage_monthly_rupees": [
            _rupees(card.wage_monthly_min),
            _rupees(card.wage_monthly_max),
        ],
        "hours_per_day": card.hours_per_day,
        "shifts": [s.value for s in card.shifts],
        "willing_to_live_in": card.willing_to_live_in,
        "languages": card.languages,
        "district": card.district_name,
        "town": card.town_name,
        "id_verified": card.id_verified,
        "police_verified": card.police_verified,
        "rating": card.rating_avg,
        "review_count": card.rating_count,
        "profile_path": f"/helpers/{card.id}",
    }


async def _resolve_district(db, value: str) -> str | None:
    """A slug, or a name close enough to one. None when it is neither."""
    row = (
        await db.execute(
            select(District.slug)
            .where(
                or_(
                    District.slug == value,
                    District.name.ilike(value),
                    District.name_ml.ilike(value),
                )
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row


async def _resolve_town(db, value: str, district: str | None) -> str | None:
    """A town slug from a slug or a name, inside the district when known."""
    stmt = (
        select(Town.slug)
        .join(District, Town.district_id == District.id)
        .where(or_(Town.slug == value, Town.name.ilike(value)))
    )
    if district:
        stmt = stmt.where(District.slug == district)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


def _found_note(total: int, dropped: list[str]) -> str:
    base = (
        f"{total} match. Present them by name with their wage range and district "
        "-- do not say you found nobody. Each range is what that helper asks, and "
        "the first number is where they start, so a range topping out above the "
        "family's budget is still a real match."
    )
    if dropped:
        base += (
            " These came from a broader search: nothing matched with "
            + ", ".join(dropped)
            + ", so that was dropped. Say so in one short clause."
        )
    return base


async def _search(db, args: dict[str, Any]) -> ToolResult:
    limit = args.get("limit")
    try:
        limit = max(1, min(MAX_RESULTS, int(limit)))
    except (TypeError, ValueError):
        limit = 4

    wage_max = args.get("wage_max_rupees")
    try:
        wage_paise = int(wage_max) * 100 if wage_max is not None else None
    except (TypeError, ValueError):
        wage_paise = None

    shift = None
    raw_shift = args.get("shift")
    if raw_shift:
        try:
            shift = Shift(str(raw_shift))
        except ValueError:
            shift = None  # an invented shift is not worth failing the search

    sort = str(args.get("sort") or "rating")
    if sort not in SORTS:
        sort = "rating"

    skills = [str(s) for s in (args.get("skills") or []) if str(s).strip()]

    # Only `true` filters. `false` is what a model sends when it is filling in
    # a form, not what a family means, and it would quietly exclude everybody
    # willing to live in.
    live_in = True if args.get("live_in_required") is True else None

    unresolved: list[str] = []
    district = str(args.get("district") or "").strip() or None
    if district:
        resolved = await _resolve_district(db, district)
        if resolved is None:
            unresolved.append(f"district {district!r}")
        district = resolved

    town = str(args.get("town") or "").strip() or None
    if town:
        resolved = await _resolve_town(db, town, district)
        if resolved is None:
            unresolved.append(f"town {town!r}")
        town = resolved

    hard = {
        "district": district,
        "service": (str(args.get("service")).strip() or None) if args.get("service") else None,
        "wage_max": wage_paise,
        "q": (str(args.get("q"))[:80].strip() or None) if args.get("q") else None,
        "sort": sort,
        "limit": limit,
    }
    soft = {"town": town, "skills": skills or None, "live_in": live_in, "shift": shift}

    page = await search_profiles(db, **hard, **soft)

    # Nothing matched, and some of it was filters the family may never have
    # asked for. Try again without them and say which were dropped: a near miss
    # is worth more to somebody hiring than a dead end.
    dropped: list[str] = []
    if not page.items and any(soft.values()):
        labels = {
            "town": "a town",
            "skills": "those skills",
            "live_in": "live-in",
            "shift": "that shift",
        }
        dropped = [labels[k] for k, v in soft.items() if v]
        page = await search_profiles(db, **hard)

    note = (
        _found_note(page.total, dropped)
        if page.items
        else (
            "Nothing matched even after loosening the search. Say so in one line "
            "and suggest a higher wage or a nearby district."
        )
    )
    if unresolved:
        note = f"Ignored: {', '.join(unresolved)} -- not a place on Sahaya. " + note

    return ToolResult(
        {
            "total_matching": page.total,
            "showing": len(page.items),
            "note": note,
            "helpers": [_card_for_model(card) for card in page.items],
        }
    )


async def _resolve_place(db, args: dict[str, Any]) -> ToolResult:
    text = str(args.get("text") or "").strip()
    if not text:
        return ToolResult({"error": "Give some text to look up."})
    pattern = f"%{text}%"

    districts = (
        (
            await db.execute(
                select(District)
                .where(or_(District.name.ilike(pattern), District.name_ml.ilike(pattern)))
                .order_by(District.sort_order)
                .limit(5)
            )
        )
        .scalars()
        .all()
    )
    towns = (
        await db.execute(
            select(Town, District)
            .join(District, Town.district_id == District.id)
            .where(or_(Town.name.ilike(pattern), Town.name_ml.ilike(pattern)))
            .order_by(Town.is_major.desc(), Town.name)
            .limit(8)
        )
    ).all()

    return ToolResult(
        {
            "districts": [{"slug": d.slug, "name": d.name} for d in districts],
            "towns": [
                {
                    "slug": t.slug,
                    "name": t.name,
                    "district": d.slug,
                    "district_name": d.name,
                }
                for t, d in towns
            ],
            "note": (
                "Nothing matched. Ask which district they are in."
                if not districts and not towns
                else ""
            ),
        }
    )


async def _my_context(db, user: User) -> ToolResult:
    now = datetime.now(UTC)
    subscription = (
        await db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user.id,
                Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
                Subscription.current_end > now,
            )
            .order_by(Subscription.current_end.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    context: dict[str, Any] = {
        "name": user.full_name,
        "account_type": "family" if user.role is UserRole.HIRER else user.role.value,
        "membership_active": subscription is not None,
        "membership_until": (
            subscription.current_end.date().isoformat()
            if subscription and subscription.current_end
            else None
        ),
        "membership_renews": bool(subscription and subscription.cancelled_at is None),
    }

    conversations = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(
                or_(
                    Conversation.participant_a_id == user.id,
                    Conversation.participant_b_id == user.id,
                )
            )
        )
    ).scalar_one()
    context["open_conversations"] = conversations

    if user.role is UserRole.HELPER:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
        if profile is not None:
            context["listing"] = {
                "listed": profile.is_listed,
                "hidden_by_admin": profile.admin_hidden,
                "onboarding_step": profile.onboarding_step,
                "has_photo": bool(profile.photo_key),
                "id_verification": profile.id_verification_status.value,
                "police_verification": profile.police_verification_status.value,
                "wage_monthly_rupees": [
                    _rupees(profile.wage_monthly_min),
                    _rupees(profile.wage_monthly_max),
                ],
                # Counted, not walked: the relationship is lazy, and touching
                # it here would be a query outside the async loop's awareness.
                "skills_chosen": (
                    await db.execute(
                        select(func.count())
                        .select_from(HelperSkill)
                        .where(HelperSkill.helper_profile_id == profile.id)
                    )
                ).scalar_one(),
                "id_verified": profile.id_verification_status
                is VerificationStatus.VERIFIED,
            }
        requests = dict(
            (
                await db.execute(
                    select(HireRequest.status, func.count())
                    .where(HireRequest.helper_id == user.id)
                    .group_by(HireRequest.status)
                )
            ).all()
        )
    else:
        requests = dict(
            (
                await db.execute(
                    select(HireRequest.status, func.count())
                    .where(HireRequest.hirer_id == user.id)
                    .group_by(HireRequest.status)
                )
            ).all()
        )
        context["saved_helpers"] = (
            await db.execute(
                select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id)
            )
        ).scalar_one()

    context["hire_requests"] = {
        status.value: requests.get(status, 0) for status in HireRequestStatus
    }
    return ToolResult(context)


async def _find_helper(db, args: dict[str, Any]):
    """The helper this proposal is about: by id when given, else by name.

    Either way the row is looked up and checked here, so a stale id or a
    half-remembered name cannot become a button for the wrong person.
    """
    raw_id = str(args.get("helper_profile_id") or "").strip()
    if raw_id:
        try:
            profile = await db.get(HelperProfile, uuid.UUID(raw_id))
        except ValueError:
            profile = None
        if profile is not None:
            return profile, None
        # Fall through to the name: an id the model half-remembered is not a
        # reason to give up if it also told us who it meant.

    name = " ".join(str(args.get("helper_name") or "").split())
    if not name:
        return None, "Name the helper you mean (the name you listed), and the message."

    rows = (
        await db.execute(
            select(HelperProfile, User)
            .join(User, HelperProfile.user_id == User.id)
            .where(
                HelperProfile.is_listed.is_(True),
                HelperProfile.admin_hidden.is_(False),
                User.full_name.ilike(name),
            )
            .limit(5)
        )
    ).all()
    if not rows:
        rows = (
            await db.execute(
                select(HelperProfile, User)
                .join(User, HelperProfile.user_id == User.id)
                .where(
                    HelperProfile.is_listed.is_(True),
                    HelperProfile.admin_hidden.is_(False),
                    User.full_name.ilike(f"%{name}%"),
                )
                .limit(5)
            )
        ).all()

    if not rows:
        return None, (
            f"No listed helper called {name!r}. Search again and use a name from "
            "the results."
        )
    if len(rows) > 1:
        options = ", ".join(u.full_name for _, u in rows)
        return None, (
            f"More than one listed helper matches {name!r}: {options}. Ask the "
            "family which one, or search again and use the full name."
        )
    return rows[0][0], None


async def _propose_message(db, user: User, args: dict[str, Any]) -> ToolResult:
    """Prepare a first message. Sends nothing, and checks the helper is real."""
    profile, problem = await _find_helper(db, args)
    if problem:
        return ToolResult({"error": problem})
    if profile is None or not profile.is_listed or profile.admin_hidden:
        # Re-validated rather than trusted from the model: this is what stops a
        # hallucinated or stale reference becoming a button.
        return ToolResult(
            {"error": "That helper is not listed. Search again and use a current name."}
        )

    helper = await db.get(User, profile.user_id)
    if helper is None or helper.role is not UserRole.HELPER:
        return ToolResult({"error": "That account is not a helper."})

    draft = " ".join(str(args.get("message") or "").split())[:MAX_DRAFT]
    if not draft:
        return ToolResult({"error": "Write the first message before proposing it."})

    service = await db.get(Service, profile.service_id) if profile.service_id else None
    can_send = await has_active_subscription(db, user.id)
    return ToolResult(
        {
            "proposed": True,
            "helper_name": helper.full_name,
            "membership_active": can_send,
            "note": (
                "The person now sees a button that opens this chat with the draft. "
                "Tell them it is there. Do not say the message has been sent."
                if can_send
                else "They have no live membership, so sending will ask them to "
                "subscribe first. Say so plainly."
            ),
        },
        actions=[
            {
                "kind": "message_helper",
                "helper_profile_id": str(profile.id),
                "helper_name": helper.full_name,
                "service_name": service.name if service else "",
                "draft": draft,
            }
        ],
    )


async def execute(db, user: User, call: LlmToolCall) -> ToolResult:
    """Run one tool call. Never raises: a refusal is an answer the model can use."""
    can_message = user.role is UserRole.HIRER
    if call.name == "search_helpers":
        return await _search(db, call.arguments)
    if call.name == "resolve_place":
        return await _resolve_place(db, call.arguments)
    if call.name == "get_my_context":
        return await _my_context(db, user)
    if call.name == "propose_message_helper" and can_message:
        return await _propose_message(db, user, call.arguments)
    return ToolResult({"error": f"No tool named {call.name!r} is available to you."})
