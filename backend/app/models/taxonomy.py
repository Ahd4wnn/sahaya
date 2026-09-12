"""Services and skills.

Served to web, Android and iOS from a single endpoint so the lists cannot drift
between clients. Adding a skill is a server-side change with no app release.

A helper has ONE service (the role line under their name on the card) and MANY
skills (the chips). That mirrors the card design exactly.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Service(UUIDMixin, TimestampMixin, Base):
    """The helper's primary role: maid, cook, home_nurse, ...

    Admin-managed (Admin -> Categories) once seeded. The slug is immutable
    after creation -- it lives in shared links like `/?service=home_nurse`, and
    changing it would break every one anybody has sent.
    """

    __tablename__ = "services"

    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_ml: Mapped[str] = mapped_column(String(120), default="")
    icon: Mapped[str] = mapped_column(String(64), default="")
    sort_order: Mapped[int] = mapped_column(default=0)

    #: Archived services vanish from the tabs, the search picker and the header
    #: nav, and cannot be chosen by new helpers -- but helpers already in one
    #: stay listed. Services are never deleted: helpers reference them by id,
    #: and deleting one would silently empty the role line on every card in it.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )
    #: Whether this service earns one of the ~4 slots in the site header.
    show_in_nav: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    #: The header's wording when it should differ from `name` -- the Figma
    #: frame says "Care Taker" for Elder Care and "Baby Sitter" for Child Care.
    nav_label: Mapped[str] = mapped_column(String(40), default="", server_default="")


class Skill(UUIDMixin, TimestampMixin, Base):
    """A card chip: cooking, cleaning, laundry, elder_care, ...

    Admin-managed (Admin -> Skills) once seeded, on the same terms as Service:
    the slug is immutable because it lives in shared links like
    `/?skills=cooking`, and rows are archived rather than deleted.
    """

    __tablename__ = "skills"

    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_ml: Mapped[str] = mapped_column(String(120), default="")
    sort_order: Mapped[int] = mapped_column(default=0)

    #: Archived skills vanish from the search filter and the helper's own
    #: picker, and cannot be newly chosen -- but a helper who already has one
    #: keeps the chip on their card, exactly as helpers stay listed in an
    #: archived service. Skills are never deleted: helper_skills rows reference
    #: them, and a delete would silently strip chips off cards.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )


class HelperSkill(Base):
    """Join table driving both the card chips and the skill filter."""

    __tablename__ = "helper_skills"

    helper_profile_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("helper_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("skills.id", ondelete="CASCADE"),
        primary_key=True,
    )
