"""add employee_id to users

Revision ID: 906b2f4ef855
Revises: 805a1f3de744
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa

revision = "906b2f4ef855"
down_revision = "805a1f3de744"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("employee_id", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "employee_id")
