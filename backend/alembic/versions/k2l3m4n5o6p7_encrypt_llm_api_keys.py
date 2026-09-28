"""encrypt LLM API keys stored from the admin page

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
"""
import os

import sqlalchemy as sa
from alembic import op

from app.services.secret_storage import PREFIX, encrypt_secret

revision = "k2l3m4n5o6p7"
down_revision = "j1k2l3m4n5o6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "llm_providers",
        "api_key_env",
        new_column_name="api_key_encrypted",
        existing_type=sa.String(256),
        type_=sa.Text(),
        existing_nullable=False,
    )
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, api_key_encrypted FROM llm_providers")).fetchall()
    for provider_id, legacy_value in rows:
        if not legacy_value or legacy_value.startswith(PREFIX):
            continue
        secret = os.environ.get(legacy_value, legacy_value)
        connection.execute(
            sa.text("UPDATE llm_providers SET api_key_encrypted = :value WHERE id = :id"),
            {"value": encrypt_secret(secret), "id": provider_id},
        )


def downgrade() -> None:
    op.alter_column(
        "llm_providers",
        "api_key_encrypted",
        new_column_name="api_key_env",
        existing_type=sa.Text(),
        type_=sa.String(256),
        existing_nullable=False,
    )
