#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRON_CMD="0 2 * * * cd $PROJECT_DIR && bash scripts/backup.sh >> ./data/backups/backup.log 2>&1"

echo "This will add a daily backup cron job at 2:00 AM."
echo "  Command: $CRON_CMD"
read -p "Add to crontab? [y/N] " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | sort -u | crontab -
    echo "Cron job added. View with: crontab -l"
else
    echo "Cancelled."
fi
