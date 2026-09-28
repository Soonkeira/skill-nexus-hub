"""add local publish requests

Revision ID: j1k2l3m4n5o6
Revises: i9j0k1l2m3n4
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "j1k2l3m4n5o6"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("local_skill_reports", sa.Column("local_ref", sa.String(64), nullable=True))
    op.create_table(
        "local_publish_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_local_publish_requests_user", "local_publish_requests", ["user_id"])
    op.create_table(
        "local_publish_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", UUID(as_uuid=True), sa.ForeignKey("local_publish_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_id", UUID(as_uuid=True), sa.ForeignKey("local_skill_reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("local_ref", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="public"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_local_publish_items_request", "local_publish_items", ["request_id"])


def downgrade() -> None:
    op.drop_table("local_publish_items")
    op.drop_table("local_publish_requests")
    op.drop_column("local_skill_reports", "local_ref")
