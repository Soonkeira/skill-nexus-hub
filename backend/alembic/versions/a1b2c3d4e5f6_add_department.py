"""add department to users

Revision ID: a1b2c3d4e5f6
Revises: 906b2f4ef855
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "906b2f4ef855"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("department", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "department")
