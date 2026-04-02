"""add_file_id_to_messages

Revision ID: bb8f8e03e493
Revises: 30cd3ed00f14
Create Date: 2026-04-02 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb8f8e03e493'
down_revision: Union[str, None] = '30cd3ed00f14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('file_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_messages_file_id_files',
        'messages', 'files',
        ['file_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_messages_file_id_files', 'messages', type_='foreignkey')
    op.drop_column('messages', 'file_id')
