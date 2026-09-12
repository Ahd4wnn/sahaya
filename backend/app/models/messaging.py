"""Chat: person-to-person, and the one thread that is not.

Notifications are deliberately NOT stored here. The chat page renders them as a
pinned "Sahaya" thread composed straight from the notifications table, so the
header badge keeps one source of truth instead of two that can disagree. See
docs/DECISIONS.md 016.

Ask Sahaya is the same story for the same reason -- `AssistantMessage` at the
bottom of this file, and DECISIONS.md 023.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


def ordered_pair(x: uuid.UUID, y: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """The canonical (a, b) order for a pair of users.

    Python compares UUIDs by their 128-bit integer, which is the same order as
    PostgreSQL's byte-wise uuid comparison -- so this function and the CHECK
    constraint below can never disagree about which id goes first.
    """
    return (x, y) if x < y else (y, x)


class Conversation(UUIDMixin, TimestampMixin, Base):
    """One thread between exactly two people.

    Participants are stored lowest-id-first, and `UNIQUE (a, b)` plus
    `CHECK (a < b)` together mean two people can never end up with two threads
    -- whichever of them opens it first, and however fast two taps race.

    Read state is two columns rather than a receipts table. The only question
    the UI ever asks is "how many are unread for me", and a timestamp per side
    answers it with no join.
    """

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint(
            "participant_a_id", "participant_b_id", name="uq_conversation_pair"
        ),
        CheckConstraint(
            "participant_a_id < participant_b_id", name="ck_conversation_ordered"
        ),
        Index("ix_conversation_a", "participant_a_id", "last_message_at"),
        Index("ix_conversation_b", "participant_b_id", "last_message_at"),
    )

    participant_a_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    participant_b_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    a_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    b_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def is_participant(self, user_id: uuid.UUID) -> bool:
        return user_id in (self.participant_a_id, self.participant_b_id)

    def other(self, user_id: uuid.UUID) -> uuid.UUID:
        return (
            self.participant_b_id
            if user_id == self.participant_a_id
            else self.participant_a_id
        )

    def last_read_for(self, user_id: uuid.UUID) -> datetime | None:
        return (
            self.a_last_read_at
            if user_id == self.participant_a_id
            else self.b_last_read_at
        )

    def mark_read(self, user_id: uuid.UUID, when: datetime) -> None:
        if user_id == self.participant_a_id:
            self.a_last_read_at = when
        else:
            self.b_last_read_at = when


class Message(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        # Every read is "the latest N in this thread", so this is the index.
        Index("ix_message_conversation_created", "conversation_id", "created_at"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE")
    )
    #: Nullable so a sender's account can be removed without deleting what the
    #: other person was told.
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text)


class AssistantMessage(UUIDMixin, TimestampMixin, Base):
    """One turn in somebody's thread with Ask Sahaya.

    NOT a Conversation with a bot participant, and the reason is structural:
    that table is two `users.id` columns with `CHECK (a < b)` and a unique pair,
    and every rule in app/api/v1/messages.py assumes two human accounts -- a
    family and a helper, each holding a live membership in order to send, each
    with unread counts and read receipts. A bot would need a user row, a role,
    and a forged subscription, and it would then appear in the admin user list
    and the dashboard's counts. Notifications stayed out of that table for the
    same reason; so does this.

    `actions` holds what the assistant proposed -- "message Priya, here is a
    draft" -- so the buttons are still there after a reload. Nothing in it has
    happened: an action becomes real only when the person taps it, and the tap
    goes through the ordinary messaging endpoints with their ordinary rules.

    The token counts are stored because "what is this costing" deserves an
    answer from the database rather than an estimate.
    """

    __tablename__ = "assistant_messages"
    __table_args__ = (
        # Every read is "this person's latest N turns".
        Index("ix_assistant_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    #: "user" or "assistant". A plain string, like Notification.kind, so a
    #: third kind of turn does not need a migration.
    role: Mapped[str] = mapped_column(String(16))
    body: Mapped[str] = mapped_column(Text)
    actions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    model: Mapped[str] = mapped_column(String(64), default="", server_default="")
    input_tokens: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    output_tokens: Mapped[int] = mapped_column(default=0, server_default=text("0"))
