"""add llm_providers and skill_analyses tables

Revision ID: i9j0k1l2m3n4
Revises: h7i8j9k0l1m2
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "i9j0k1l2m3n4"
down_revision = "h7i8j9k0l1m2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("provider_type", sa.String(32), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("api_key_env", sa.String(256), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="4096"),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.3"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_llm_provider_default", "llm_providers", ["is_default"],
        unique=True, postgresql_where=sa.text("is_default = TRUE"),
    )

    op.create_table(
        "skill_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("skill_id", UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", UUID(as_uuid=True), sa.ForeignKey("skill_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider_id", UUID(as_uuid=True), sa.ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("usage_guide", sa.Text(), nullable=True),
        sa.Column("effects", sa.Text(), nullable=True),
        sa.Column("best_practices", sa.Text(), nullable=True),
        sa.Column("quality_score", sa.Integer(), nullable=True),
        sa.Column("warnings", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_skill_analyses_version", "skill_analyses", ["version_id"])
    op.create_index("ix_skill_analyses_skill", "skill_analyses", ["skill_id"])
    op.create_index(
        "uq_skill_analysis_version_provider", "skill_analyses", ["version_id", "provider_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_skill_analysis_version_provider")
    op.drop_index("ix_skill_analyses_skill")
    op.drop_index("ix_skill_analyses_version")
    op.drop_table("skill_analyses")
    op.drop_index("uq_llm_provider_default")
    op.drop_table("llm_providers")
