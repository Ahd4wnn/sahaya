"""skills are admin managed: skills.is_active

Revision ID: a4c81f6b93de
Revises: 9a1f0c7e2b44
Create Date: 2026-09-12

Skills join services in the admin panel (Admin -> Skills). Like services they
are archived, never deleted -- helper_skills rows reference them, and deleting
one would silently strip chips off cards that are already listed.

Existing rows default to active, so nothing changes for anybody until an admin
archives something.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4c81f6b93de"
down_revision: str | Sequence[str] | None = "9a1f0c7e2b44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )


def downgrade() -> None:
    op.drop_column("skills", "is_active")
