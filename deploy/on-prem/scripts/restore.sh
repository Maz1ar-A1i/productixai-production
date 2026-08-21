#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

BACKUP_DIR="${1:?Usage: restore.sh backups/<timestamp>}"
[ -d "$BACKUP_DIR" ] || { echo "No such backup dir: $BACKUP_DIR"; exit 1; }

echo "This OVERWRITES the running Productix and ERPNext databases with the"
echo "contents of $BACKUP_DIR. Type 'restore' to continue:"
read -r confirm
[ "$confirm" = "restore" ] || { echo "Aborted."; exit 1; }

echo "Restoring Productix Postgres..."
docker compose -f compose.yml exec -T productix-db \
  psql -U "${PRODUCTIX_DB_USER:-productix}" -d "${PRODUCTIX_DB_NAME:-productix}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose -f compose.yml exec -T productix-db \
  psql -U "${PRODUCTIX_DB_USER:-productix}" -d "${PRODUCTIX_DB_NAME:-productix}" \
  < "$BACKUP_DIR/productix-db.sql"

echo "Restoring ERPNext site (frontend) from backup..."
docker cp "$BACKUP_DIR/erpnext-db.sql.gz" "$(docker compose -f compose.yml ps -q erpnext-backend)":/home/frappe/frappe-bench/sites/frontend/private/backups/restore.sql.gz
docker compose -f compose.yml exec -T erpnext-backend \
  bench --site frontend restore /home/frappe/frappe-bench/sites/frontend/private/backups/restore.sql.gz

echo "Restore complete. Verify with ./scripts/smoke-test.sh"
