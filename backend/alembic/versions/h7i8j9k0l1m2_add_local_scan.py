"""add local scan tables

Revision ID: h7i8j9k0l1m2
Revises: g1a2b3c4d5e6
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "h7i8j9k0l1m2"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scan_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("device_name", sa.String(128), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="completed"),
        sa.Column("skill_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scanned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_scan_batches_user", "scan_batches", ["user_id"])
    op.create_index("ix_scan_batches_user_device", "scan_batches", ["user_id", "device_id"])

    op.create_table(
        "local_skill_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("scan_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("skill_name", sa.String(128), nullable=False),
        sa.Column("skill_slug", sa.String(128), nullable=False),
        sa.Column("relative_directory", sa.String(512), nullable=False),
        sa.Column("agent_target", sa.String(64), nullable=True),
        sa.Column("files", JSONB, nullable=True),
        sa.Column("has_skill_md", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_skill_yaml", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_local_skill_reports_batch", "local_skill_reports", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_local_skill_reports_batch")
    op.drop_table("local_skill_reports")
    op.drop_index("ix_scan_batches_user_device")
    op.drop_index("ix_scan_batches_user")
    op.drop_table("scan_batches")
