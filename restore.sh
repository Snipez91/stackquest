#!/usr/bin/env sh
# Restore the database from a backup: ./restore.sh backups/stackquest-YYYYMMDD-HHMMSS.dump
# This REPLACES all current data.
set -eu
cd "$(dirname "$0")"
f=${1:-}
if [ -z "$f" ] || [ ! -f "$f" ]; then
  echo "Usage: ./restore.sh backups/<file>.dump" >&2
  ls -1t backups/*.dump 2>/dev/null | head -5 >&2 || true
  exit 1
fi
printf "This replaces ALL current StackQuest data with %s. Type 'restore' to continue: " "$f"
read -r ok
[ "$ok" = "restore" ] || { echo "Cancelled."; exit 1; }
docker compose stop app
docker compose exec -T db pg_restore -U stackquest -d stackquest --clean --if-exists --no-owner < "$f"
docker compose start app
echo "Restored from $f."
