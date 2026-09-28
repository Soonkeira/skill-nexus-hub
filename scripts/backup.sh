#!/usr/bin/env bash
set -e

BACKUP_DIR="./data/backups/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Starting backup..."

# Dump PostgreSQL
echo "  Dumping database..."
docker compose exec -T postgres pg_dump -U skillhub skill_nexus_hub > "$BACKUP_DIR/db.sql"
echo "  Database dumped."

# Sync skill files
echo "  Syncing skill files..."
if [ -d "./data/skills" ]; then
    cp -r ./data/skills "$BACKUP_DIR/skills"
    echo "  Skill files synced."
else
    echo "  No skill files directory found, skipping."
fi

# Clean backups older than 30 days
echo "  Cleaning old backups..."
find ./data/backups -maxdepth 1 -mindepth 1 -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "Backup completed: $BACKUP_DIR"
echo "  Size: $(du -sh "$BACKUP_DIR" | cut -f1)"
