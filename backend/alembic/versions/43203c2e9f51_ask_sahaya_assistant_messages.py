"""ask sahaya: the assistant's own thread

Revision ID: 43203c2e9f51
Revises: a4c81f6b93de
Create Date: 2026-09-12

Ask Sahaya keeps its turns in its own table rather than in `conversations` and
`messages`: those assume two human accounts with live memberships, read
receipts and unread counts (see app/models/messaging.py). `actions` holds what
the assistant proposed, so the confirm buttons survive a reload; the token
counts are there so the API bill can be answered from the database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '43203c2e9f51'
down_revision: Union[str, Sequence[str], None] = 'a4c81f6b93de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('assistant_messages',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('actions', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('model', sa.String(length=64), server_default='', nullable=False),
    sa.Column('input_tokens', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('output_tokens', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        'ix_assistant_user_created',
        'assistant_messages',
        ['user_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_assistant_user_created', table_name='assistant_messages')
    op.drop_table('assistant_messages')
