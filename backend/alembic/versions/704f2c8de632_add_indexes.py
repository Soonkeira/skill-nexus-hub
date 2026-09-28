"""add indexes

Revision ID: 704f2c8de632
Revises: 603a1b4cd521
Create Date: 2026-06-04 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "704f2c8de632"
down_revision = "603a1b4cd521"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_skills_visibility", "skills", ["visibility"])
    op.create_index("ix_skills_owner_id", "skills", ["owner_id"])
    op.create_index("ix_skill_versions_skill_id", "skill_versions", ["skill_id"])
    op.create_index("ix_skill_versions_status", "skill_versions", ["status"])
    op.create_index("ix_comments_skill_id", "comments", ["skill_id"])
    op.create_index("ix_download_logs_skill_id", "download_logs", ["skill_id"])
    op.create_index("ix_install_logs_skill_id", "install_logs", ["skill_id"])


def downgrade() -> None:
    op.drop_index("ix_install_logs_skill_id", table_name="install_logs")
    op.drop_index("ix_download_logs_skill_id", table_name="download_logs")
    op.drop_index("ix_comments_skill_id", table_name="comments")
    op.drop_index("ix_skill_versions_status", table_name="skill_versions")
    op.drop_index("ix_skill_versions_skill_id", table_name="skill_versions")
    op.drop_index("ix_skills_owner_id", table_name="skills")
    op.drop_index("ix_skills_visibility", table_name="skills")
