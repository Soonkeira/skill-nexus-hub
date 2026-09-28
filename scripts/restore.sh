#!/usr/bin/env bash
set -e

BACKUP_DATE="${1:?Usage: restore.sh <backup-directory-name>}"
BACKUP_PATH="./data/backups/$BACKUP_DATE"

if [ ! -d "$BACKUP_PATH" ]; then
    echo "Error: Backup not found at $BACKUP_PATH"
    echo ""
    echo "Available backups:"
    ls -1 ./data/backups/ 2>/dev/null || echo "  (none)"
    exit 1
fi

echo "WARNING: This will replace the current database and skill files!"
echo "  Backup: $BACKUP_PATH"
read -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

echo "Restoring..."

# Restore database
echo "  Restoring database..."
cat "$BACKUP_PATH/db.sql" | docker compose exec -T postgres psql -U skillhub skill_nexus_hub
echo "  Database restored."

# Restore skill files
if [ -d "$BACKUP_PATH/skills" ]; then
    echo "  Restoring skill files..."
    rm -rf ./data/skills
    cp -r "$BACKUP_PATH/skills" ./data/skills
    echo "  Skill files restored."
fi

echo "Restore completed from: $BACKUP_PATH"
echo "Restart the backend to pick up changes: docker compose restart backend"
