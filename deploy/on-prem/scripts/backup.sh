#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/$STAMP"
mkdir -p "$OUT"

echo "Backing up Productix Postgres..."
docker compose -f compose.yml exec -T productix-db \
  pg_dump -U "${PRODUCTIX_DB_USER:-productix}" "${PRODUCTIX_DB_NAME:-productix}" \
  > "$OUT/productix-db.sql"

echo "Backing up ERPNext MariaDB (sites/frontend)..."
docker compose -f compose.yml exec -T erpnext-backend \
  bench --site frontend backup --with-files
docker run --rm \
  -v productix-erpnext_erpnext_sites:/sites \
  -v "$(pwd)/$OUT:/backup" \
  alpine sh -c "cd /sites/frontend/private/backups && cp \$(ls -t *.sql.gz | head -1) /backup/erpnext-db.sql.gz && cp \$(ls -t *-files.tar | head -1) /backup/erpnext-files.tar 2>/dev/null || true"

echo "Backing up ERPNext site config/files volume snapshot..."
docker run --rm \
  -v productix-erpnext_erpnext_sites:/sites:ro \
  -v "$(pwd)/$OUT:/backup" \
  alpine tar czf /backup/erpnext-sites-volume.tar.gz -C / sites

echo "Backup written to $OUT"
