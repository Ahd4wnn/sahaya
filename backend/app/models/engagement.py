"""Favorites and notifications -- the two things the site header needs.

Both are deliberately thin. A favorite is a join row and nothing else; a
notification is a rendered message with a read timestamp. Neither carries
business logic, because neither is a decision -- they are records of one.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Favorite(UUIDMixin, TimestampMixin, Base):
    """A hirer's saved helper -- the "Liked profiles" list in the profile menu.

    The unique constraint is what makes the heart idempotent: tapping it twice
    from two tabs cannot produce two rows.
    """

    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "helper_profile_id", name="uq_favorite_pair"),
        Index("ix_favorite_user", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    helper_profile_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("helper_profiles.id", ondelete="CASCADE")
    )


class Notification(UUIDMixin, TimestampMixin, Base):
    """One rendered message for one user.

    The text is stored already written rather than assembled at read time. A
    notification is a record of what we told someone -- if the wording of a
    template changes later, history should not silently change with it.

    `kind` drives the icon and the link, and is a plain string rather than an
    enum so adding a notification type does not need a migration.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        # The unread badge and the panel both read this ordering.
        Index("ix_notification_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(40), default="system")
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="")
    #: Where clicking it goes. A client-side path, not a URL.
    link: Mapped[str] = mapped_column(String(300), default="")
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
