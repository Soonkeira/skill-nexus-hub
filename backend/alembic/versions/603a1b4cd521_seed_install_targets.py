"""seed install targets

Revision ID: 603a1b4cd521
Revises: 502f663ce044
Create Date: 2026-06-04
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "603a1b4cd521"
down_revision = "502f663ce044"
branch_labels = None
depends_on = None

TARGETS = [
    {
        "name": "claude-code",
        "display_name": "Claude Code",
        "global_path": "~/.claude/skills",
        "project_path": ".claude/skills",
        "description": "Anthropic Claude Code CLI agent",
    },
    {
        "name": "cursor",
        "display_name": "Cursor",
        "global_path": "~/.cursor/skills",
        "project_path": ".cursor/skills",
        "description": "Cursor AI code editor",
    },
    {
        "name": "codex",
        "display_name": "Codex CLI",
        "global_path": "~/.codex/skills",
        "project_path": ".codex/skills",
        "description": "OpenAI Codex CLI agent",
    },
    {
        "name": "windsurf",
        "display_name": "Windsurf",
        "global_path": "~/.windsurf/skills",
        "project_path": ".windsurf/skills",
        "description": "Codeium Windsurf IDE",
    },
    {
        "name": "openclaw",
        "display_name": "OpenClaw",
        "global_path": "~/.openclaw/skills",
        "project_path": ".openclaw/skills",
        "description": "OpenClaw AI agent",
    },
]


def upgrade() -> None:
    # Add an explicit UUID for each row since bulk_insert bypasses
    # ORM defaults (uuid.uuid4 on the model column).
    rows = [{**t, "id": uuid.uuid4()} for t in TARGETS]

    t = sa.table(
        "skill_install_targets",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("global_path", sa.String),
        sa.column("project_path", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(t, rows)


def downgrade() -> None:
    names = [t["name"] for t in TARGETS]
    for name in names:
        op.execute(sa.text("DELETE FROM skill_install_targets WHERE name = :name").bindparams(name=name))
