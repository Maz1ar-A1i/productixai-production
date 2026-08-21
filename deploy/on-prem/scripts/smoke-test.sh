#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

pass=0
fail=0

check() {
  local name="$1"; local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "OK   - $name"
    pass=$((pass+1))
  else
    echo "FAIL - $name"
    fail=$((fail+1))
  fi
}

check "productix-backend responds"   "docker compose -f compose.yml exec -T productix-backend curl -fsS http://localhost:8000/docs -o /dev/null"
check "productix-db accepts conn"    "docker compose -f compose.yml exec -T productix-db pg_isready -U ${PRODUCTIX_DB_USER:-productix}"
check "erpnext-frontend responds"    "docker compose -f compose.yml exec -T erpnext-frontend curl -fsS http://localhost:8080 -o /dev/null"
check "caddy responds"               "curl -fsS -o /dev/null -H 'Host: ${PRODUCTIX_DOMAIN:-app.productix.local}' http://localhost:${HTTP_PUBLISH_PORT:-80}/"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
