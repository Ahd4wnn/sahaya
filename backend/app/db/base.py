"""Declarative base and the mixins every table uses."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def uuid7() -> uuid.UUID:
    """Time-ordered UUID.

    Python's stdlib has no uuid7 yet. Prefixing uuid4 randomness with a
    millisecond timestamp gives the property we actually want -- keys that sort
    by creation time, so B-tree inserts stay at the right edge of the index
    instead of scattering, and IDs do not leak row counts the way a sequence does.
    """
    import os
    import time

    ms = int(time.time() * 1000) & ((1 << 48) - 1)
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms << 80) | (0x7 << 76) | (rand & ((1 << 76) - 1))
    return uuid.UUID(int=value & ((1 << 128) - 1), version=None)


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid7
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
