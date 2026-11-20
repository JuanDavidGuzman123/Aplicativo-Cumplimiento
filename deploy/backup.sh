#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No existe $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_BACKUP="$BACKUP_DIR/db-$STAMP.dump"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$STAMP.tar.gz"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "$DB_BACKUP"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  tar -czf - -C /app/uploads . \
  > "$UPLOADS_BACKUP"

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

echo "Respaldo completado:"
echo "  $DB_BACKUP"
echo "  $UPLOADS_BACKUP"
