"""rename best_practices column to use_cases

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
"""
from alembic import op
import sqlalchemy as sa

revision = "l3m4n5o6p7q8"
down_revision = "k2l3m4n5o6p7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "skill_analyses",
        "best_practices",
        new_column_name="use_cases",
        existing_type=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "skill_analyses",
        "use_cases",
        new_column_name="best_practices",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
