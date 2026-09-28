"""initial tables

Revision ID: 301d441ac422
Revises:
Create Date: 2026-06-03 08:49:52.093914

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = '301d441ac422'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        'users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('username', sa.String(64), unique=True, nullable=False),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'publisher', 'user', name='user_role', create_constraint=True), nullable=False, server_default='user'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. skill_install_targets (no FK dependencies)
    op.create_table(
        'skill_install_targets',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(64), unique=True, nullable=False),
        sa.Column('display_name', sa.String(128), nullable=False),
        sa.Column('global_path', sa.String(512), nullable=False),
        sa.Column('project_path', sa.String(512), nullable=True),
        sa.Column('description', sa.Text, nullable=True),
    )

    # 3. skills (no FK to skill_versions yet - will add later)
    op.create_table(
        'skills',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('slug', sa.String(128), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tags', JSONB, nullable=True),
        sa.Column('visibility', sa.Enum('public', 'private', name='visibility', create_constraint=True), server_default='public'),
        sa.Column('icon_path', sa.String(512), nullable=True),
        sa.Column('owner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 4. skill_versions (FK to skills now exists)
    op.create_table(
        'skill_versions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('skill_id', UUID(as_uuid=True), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('version', sa.String(32), nullable=False),
        sa.Column('readme', sa.Text, nullable=True),
        sa.Column('changelog', sa.Text, nullable=True),
        sa.Column('file_path', sa.String(512), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=True),
        sa.Column('file_size', sa.BigInteger, nullable=False),
        sa.Column('checksum', sa.String(64), nullable=False),
        sa.Column('publisher_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='version_status', create_constraint=True), server_default='pending'),
        sa.Column('reviewer_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('skill_id', 'version', name='uq_skill_version'),
    )

    # 5. Add skills.latest_version_id FK (now skill_versions exists)
    op.add_column('skills', sa.Column('latest_version_id', UUID(as_uuid=True), sa.ForeignKey('skill_versions.id'), nullable=True))

    # 6. comments
    op.create_table(
        'comments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('skill_id', UUID(as_uuid=True), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('version_id', UUID(as_uuid=True), sa.ForeignKey('skill_versions.id'), nullable=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('parent_id', UUID(as_uuid=True), sa.ForeignKey('comments.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 7. collaborators
    op.create_table(
        'collaborators',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('skill_id', UUID(as_uuid=True), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.Enum('owner', 'editor', 'viewer', name='collaborator_role', create_constraint=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('skill_id', 'user_id', name='uq_skill_user'),
    )

    # 8. api_tokens
    op.create_table(
        'api_tokens',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False),
        sa.Column('token_prefix', sa.String(8), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 9. install_logs
    op.create_table(
        'install_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('skill_id', UUID(as_uuid=True), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('version_id', UUID(as_uuid=True), sa.ForeignKey('skill_versions.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('target', sa.String(64), nullable=False),
        sa.Column('installed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 10. download_logs
    op.create_table(
        'download_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('skill_id', UUID(as_uuid=True), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('version_id', UUID(as_uuid=True), sa.ForeignKey('skill_versions.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('source', sa.Enum('cli', 'web', name='download_source', create_constraint=True), nullable=False),
        sa.Column('downloaded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('download_logs')
    op.drop_table('install_logs')
    op.drop_table('api_tokens')
    op.drop_table('collaborators')
    op.drop_table('comments')
    op.drop_column('skills', 'latest_version_id')
    op.drop_table('skill_versions')
    op.drop_table('skills')
    op.drop_table('skill_install_targets')
    op.drop_table('users')

    sa.Enum(name='download_source').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='collaborator_role').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='version_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='visibility').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='user_role').drop(op.get_bind(), checkfirst=True)
