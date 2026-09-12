"""Kerala geography: 14 districts and their towns.

Shaped as a flat region table with a slug, not as anything Kerala-specific --
expanding beyond Kerala means adding a `states` table above this and a state_id
column, and nothing else in the schema changes.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class District(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "districts"

    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_ml: Mapped[str] = mapped_column(String(120), default="")
    sort_order: Mapped[int] = mapped_column(default=0)

    towns: Mapped[list["Town"]] = relationship(
        back_populates="district", cascade="all, delete-orphan"
    )


class Town(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "towns"

    district_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("districts.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(96), index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_ml: Mapped[str] = mapped_column(String(120), default="")
    #: Shown before the "Show all" fold in the filter.
    is_major: Mapped[bool] = mapped_column(Boolean, default=False)

    district: Mapped[District] = relationship(back_populates="towns")
