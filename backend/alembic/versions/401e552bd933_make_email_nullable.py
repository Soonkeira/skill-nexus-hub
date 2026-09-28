"""make email nullable

Revision ID: 401e552bd933
Revises: 301d441ac422
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '401e552bd933'
down_revision: Union[str, None] = '301d441ac422'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'email',
        existing_type=sa.String(255),
        nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'email',
        existing_type=sa.String(255),
        nullable=False)
