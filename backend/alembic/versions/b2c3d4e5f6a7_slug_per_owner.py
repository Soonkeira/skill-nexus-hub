"""change slug to per-owner unique

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-05
"""
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("skills_slug_key", "skills", type_="unique")
    op.create_unique_constraint("uq_owner_slug", "skills", ["owner_id", "slug"])


def downgrade() -> None:
    op.drop_constraint("uq_owner_slug", "skills", type_="unique")
    op.create_unique_constraint("skills_slug_key", "skills", ["slug"])
