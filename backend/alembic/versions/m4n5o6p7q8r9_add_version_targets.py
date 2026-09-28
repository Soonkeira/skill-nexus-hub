"""add install targets to skill versions

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "m4n5o6p7q8r9"
down_revision = "l3m4n5o6p7q8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "skill_versions",
        sa.Column("targets", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute(
        """
        UPDATE skill_versions AS version
        SET targets = matched.targets
        FROM (
            SELECT
                version_inner.id,
                jsonb_agg(target.name ORDER BY target.name) AS targets
            FROM skill_versions AS version_inner
            JOIN skills AS skill ON skill.id = version_inner.skill_id
            JOIN skill_install_targets AS target
              ON COALESCE(skill.tags, '[]'::jsonb) @> jsonb_build_array(target.name)
            GROUP BY version_inner.id
        ) AS matched
        WHERE version.id = matched.id
        """
    )


def downgrade() -> None:
    op.drop_column("skill_versions", "targets")
