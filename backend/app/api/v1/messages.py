"""Person-to-person chat.

Any family can message any helper, and either can reply -- but both sides need
a live membership to *send* (docs/DECISIONS.md 016). Reading is never gated: a
member whose subscription lapses can still see their history, they just cannot
add to it.

Notifications are not stored here. The chat page renders them as a pinned
"Sahaya" thread straight from the notifications table, so the header badge has
one source of truth rather than two that can disagree.

Delivery is realtime: every send and read publishes an event that the socket
in app/api/v1/realtime.py pushes to whoever is online (DECISIONS.md 017).
Everything here stays plain REST regardless -- the socket only announces, so
a client that loses it loses immediacy, never data.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import case, func, or_, select, tuple_
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession, has_active_subscription
from app.models.engagement import Notification
from app.models.enums import UserRole, UserStatus
from app.models.marketplace import HelperProfile
from app.models.messaging import Conversation, Message, ordered_pair
from app.models.user import User
from app.providers.registry import get_storage
from app.services.events import publish

router = APIRouter(tags=["messages"])

MAX_BODY = 2000


class ParticipantOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    role: UserRole
    #: Set for helpers, so the chat header can link to their public profile.
    helper_profile_id: uuid.UUID | None
    #: The original photo, never the cutout -- a cut-out portrait squeezed into
    #: a small circle loses the shoulders that make it read as a person.
    photo_url: str | None
    subscribed: bool


class ConversationOut(BaseModel):
    id: uuid.UUID
    other: ParticipantOut
    last_message: str | None
    last_message_at: datetime | None
    last_message_mine: bool
    unread: int
    #: Computed server-side so the composer renders the right state up front,
    #: instead of discovering it from a failed send.
    can_send: bool
    #: "you_need_membership" | "they_need_membership" | None
    blocked_reason: str | None
    #: When the other person last read this thread -- what drives "Seen"
    #: under the sender's latest message.
    other_read_at: datetime | None


class MessageOut(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID | None
    body: str
    created_at: datetime
    mine: bool


class MessagesOut(BaseModel):
    items: list[MessageOut]
    has_more: bool


class StartIn(BaseModel):
    """Who to talk to. A family starts from a helper's card, so it holds a
    helper profile id; a helper replying to a family holds their user id."""

    helper_profile_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.helper_profile_id is None) == (self.user_id is None):
            raise ValueError("Give exactly one of helper_profile_id or user_id")
        return self


class SendIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)


class UnreadOut(BaseModel):
    notifications: int
    messages: int


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _first_name(user: User) -> str:
    return (user.full_name or "They").split()[0]


def _blocked_reason(me_ok: bool, other_ok: bool) -> str | None:
    if not me_ok:
        return "you_need_membership"
    if not other_ok:
        return "they_need_membership"
    return None


async def _participant(db, user: User) -> ParticipantOut:
    profile = None
    if user.role is UserRole.HELPER:
        profile = (
            await db.execute(
                select(HelperProfile).where(HelperProfile.user_id == user.id)
            )
        ).scalar_one_or_none()
    storage = get_storage()
    return ParticipantOut(
        user_id=user.id,
        full_name=user.full_name or "Sahaya member",
        role=user.role,
        helper_profile_id=profile.id if profile else None,
        photo_url=(
            storage.url_for(key=profile.photo_key)
            if profile and profile.photo_key
            else None
        ),
        subscribed=await has_active_subscription(db, user.id),
    )


async def _unread_in(db, convo: Conversation, user_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id == convo.id, Message.sender_id != user_id)
    )
    last_read = convo.last_read_for(user_id)
    if last_read is not None:
        stmt = stmt.where(Message.created_at > last_read)
    return (await db.execute(stmt)).scalar_one()


async def _serialize(db, convo: Conversation, me: User, me_ok: bool) -> ConversationOut:
    other = await _participant(db, await db.get(User, convo.other(me.id)))
    last = (
        await db.execute(
            select(Message)
            .where(Message.conversation_id == convo.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    reason = _blocked_reason(me_ok, other.subscribed)
    return ConversationOut(
        id=convo.id,
        other=other,
        last_message=last.body if last else None,
        last_message_at=last.created_at if last else None,
        last_message_mine=bool(last and last.sender_id == me.id),
        unread=await _unread_in(db, convo, me.id),
        can_send=reason is None,
        blocked_reason=reason,
        other_read_at=convo.last_read_for(other.user_id),
    )


async def _own_conversation(db, conversation_id: uuid.UUID, user: User) -> Conversation:
    convo = await db.get(Conversation, conversation_id)
    # 404 rather than 403 for someone else's thread: confirming it exists
    # would leak who is talking to whom.
    if convo is None or not convo.is_participant(user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    return convo


def _message_out(msg: Message, me: User) -> MessageOut:
    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        body=msg.body,
        created_at=msg.created_at,
        mine=msg.sender_id == me.id,
    )


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #
@router.get("/me/conversations", response_model=list[ConversationOut])
async def my_conversations(user: CurrentUser, db: DbSession) -> list[ConversationOut]:
    rows = (
        await db.execute(
            select(Conversation)
            .where(
                or_(
                    Conversation.participant_a_id == user.id,
                    Conversation.participant_b_id == user.id,
                )
            )
            .order_by(
                Conversation.last_message_at.desc().nullslast(),
                Conversation.created_at.desc(),
            )
        )
    ).scalars().all()
    me_ok = await has_active_subscription(db, user.id)
    return [await _serialize(db, convo, user, me_ok) for convo in rows]


@router.get("/me/unread", response_model=UnreadOut)
async def unread(user: CurrentUser, db: DbSession) -> UnreadOut:
    """One cheap call for the header badge: alerts plus unread messages."""
    notifications = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        )
    ).scalar_one()

    my_last_read = case(
        (Conversation.participant_a_id == user.id, Conversation.a_last_read_at),
        else_=Conversation.b_last_read_at,
    )
    messages = (
        await db.execute(
            select(func.count())
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                or_(
                    Conversation.participant_a_id == user.id,
                    Conversation.participant_b_id == user.id,
                ),
                Message.sender_id != user.id,
                or_(my_last_read.is_(None), Message.created_at > my_last_read),
            )
        )
    ).scalar_one()
    return UnreadOut(notifications=notifications, messages=messages)


@router.post("/conversations", response_model=ConversationOut)
async def start_conversation(
    payload: StartIn, user: CurrentUser, db: DbSession
) -> ConversationOut:
    """Open the thread with someone, or return the one that already exists."""
    if user.role not in (UserRole.HIRER, UserRole.HELPER):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only families and helpers can message each other."
        )

    if payload.helper_profile_id is not None:
        profile = await db.get(HelperProfile, payload.helper_profile_id)
        if profile is None or not profile.is_listed or profile.admin_hidden:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Helper not found.")
        other = await db.get(User, profile.user_id)
    else:
        other = await db.get(User, payload.user_id)

    if other is None or other.status is not UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person is not available.")
    if other.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot message yourself.")
    if {user.role, other.role} != {UserRole.HIRER, UserRole.HELPER}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Messages are between a family and a helper."
        )

    if not await has_active_subscription(db, user.id):
        who = "helpers" if user.role is UserRole.HIRER else "families"
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"A Sahaya membership is needed to message {who}.",
        )

    a, b = ordered_pair(user.id, other.id)
    pair = (Conversation.participant_a_id == a, Conversation.participant_b_id == b)
    convo = (await db.execute(select(Conversation).where(*pair))).scalar_one_or_none()
    if convo is None:
        convo = Conversation(participant_a_id=a, participant_b_id=b)
        db.add(convo)
        try:
            await db.flush()
        except IntegrityError:
            # Two taps racing to open the same thread. The unique constraint
            # won; use the row the other request created.
            await db.rollback()
            convo = (await db.execute(select(Conversation).where(*pair))).scalar_one()

    return await _serialize(db, convo, user, me_ok=True)


@router.get("/conversations/{conversation_id}/messages", response_model=MessagesOut)
async def list_messages(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    before: uuid.UUID | None = Query(
        default=None, description="Message id; returns the page older than it"
    ),
    limit: int = Query(default=40, ge=1, le=100),
) -> MessagesOut:
    """The latest page, oldest first -- or the page before `before`."""
    convo = await _own_conversation(db, conversation_id, user)

    stmt = select(Message).where(Message.conversation_id == convo.id)
    if before is not None:
        pivot = await db.get(Message, before)
        if pivot is None or pivot.conversation_id != convo.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown cursor.")
        # Row-value comparison, so two messages sharing a timestamp are still
        # paged in a stable order.
        stmt = stmt.where(
            tuple_(Message.created_at, Message.id) < tuple_(pivot.created_at, pivot.id)
        )

    rows = (
        await db.execute(
            stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)
        )
    ).scalars().all()
    has_more = len(rows) > limit
    page = list(reversed(rows[:limit]))
    return MessagesOut(items=[_message_out(m, user) for m in page], has_more=has_more)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: uuid.UUID, payload: SendIn, user: CurrentUser, db: DbSession
) -> MessageOut:
    """Send one message. Both sides must hold a live membership."""
    convo = await _own_conversation(db, conversation_id, user)
    other = await db.get(User, convo.other(user.id))

    if not await has_active_subscription(db, user.id):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Your membership has lapsed. Renew it to keep messaging.",
        )
    if other is None or other.status is not UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is no longer on Sahaya.")
    if not await has_active_subscription(db, other.id):
        # 409, not 402: the fix is not something this caller can pay for, and
        # the client must not show them a membership prompt for it.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{_first_name(other)}'s membership has lapsed, so they cannot receive "
            "messages right now.",
        )

    body = payload.body.strip()
    if not body:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Write a message first.")

    message = Message(conversation_id=convo.id, sender_id=user.id, body=body)
    db.add(message)
    await db.flush()
    await db.refresh(message)

    convo.last_message_at = message.created_at
    # Sending is reading: nobody should see their own thread light up as unread
    # the moment they reply to it.
    convo.mark_read(user.id, message.created_at)
    await db.flush()

    # To both sides: the recipient sees it arrive, and the sender's other
    # open tabs stay in step with the one they typed in. Delivered only if
    # this transaction commits -- see app/services/events.py.
    await publish(
        db,
        to=[other.id, user.id],
        type="message",
        data={
            "conversation_id": str(convo.id),
            "message": {
                "id": str(message.id),
                "sender_id": str(user.id),
                "body": message.body,
                "created_at": message.created_at.isoformat(),
            },
        },
    )
    return _message_out(message, user)


@router.post(
    "/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT
)
async def mark_read(conversation_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    convo = await _own_conversation(db, conversation_id, user)
    now = datetime.now(UTC)
    convo.mark_read(user.id, now)
    await db.flush()
    # The other side learns it was read; this person's other tabs clear
    # their badge without waiting for anything.
    await publish(
        db,
        to=[convo.other(user.id), user.id],
        type="read",
        data={
            "conversation_id": str(convo.id),
            "reader_id": str(user.id),
            "read_at": now.isoformat(),
        },
    )
