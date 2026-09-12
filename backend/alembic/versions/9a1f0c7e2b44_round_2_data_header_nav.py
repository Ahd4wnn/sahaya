"""round 2 data: put the frame's four services in the header

Revision ID: 9a1f0c7e2b44
Revises: 8d3248dcc984
Create Date: 2026-09-11

The schema migration added services.show_in_nav and services.nav_label,
defaulting to false and ''. The seed script is insert-only for services --
once a service exists it belongs to the admin panel -- so an existing database
would otherwise come up with an empty header nav.

This sets the four services the Figma frame shows, with the frame's own
wording, and only where nobody has touched them yet: a row that already has a
nav flag or label was set by an admin, and a migration has no business
overwriting that.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9a1f0c7e2b44"
down_revision: str | Sequence[str] | None = "8d3248dcc984"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAV = {
    "home_nurse": "Home Nurse",
    "elder_care": "Care Taker",
    "maid": "Household Helps",
    "child_care": "Baby Sitter",
}


def upgrade() -> None:
    for slug, label in NAV.items():
        op.execute(
            sa.text(
                "UPDATE services SET show_in_nav = true, nav_label = :label "
                "WHERE slug = :slug AND show_in_nav = false AND nav_label = ''"
            ).bindparams(label=label, slug=slug)
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE services SET show_in_nav = false, nav_label = '' "
            "WHERE slug IN ('home_nurse', 'elder_care', 'maid', 'child_care')"
        )
    )
