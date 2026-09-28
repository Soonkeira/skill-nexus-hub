"""add password_changed_at to users

Revision ID: 805a1f3de744
Revises: 704f2c8de632
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa

revision = "805a1f3de744"
down_revision = "704f2c8de632"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
