"""make audit_logs.actor_id nullable with SET NULL

Revision ID: f8a9b0c1d2e3
Revises: f7a8b9c0d1e2
Create Date: 2026-06-08
"""
from alembic import op

revision = "f8a9b0c1d2e3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('audit_logs_actor_id_fkey', 'audit_logs', type_='foreignkey')
    op.alter_column('audit_logs', 'actor_id', nullable=True)
    op.create_foreign_key('audit_logs_actor_id_fkey', 'audit_logs', 'users', ['actor_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('audit_logs_actor_id_fkey', 'audit_logs', type_='foreignkey')
    op.alter_column('audit_logs', 'actor_id', nullable=False)
    op.create_foreign_key('audit_logs_actor_id_fkey', 'audit_logs', 'users', ['actor_id'], ['id'])
