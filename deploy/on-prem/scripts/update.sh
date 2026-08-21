#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "This rebuilds Productix images and restarts the stack. ERPNext image"
echo "version is controlled by ERPNEXT_VERSION in .env — bump it deliberately,"
echo "don't rely on 'latest'."
echo
echo "Have you taken a backup? (./scripts/backup.sh) [y/N]"
read -r confirm
if [ "$confirm" != "y" ]; then
  echo "Aborted. Run ./scripts/backup.sh first."
  exit 1
fi

docker compose -f compose.yml build --pull
docker compose -f compose.yml up -d
echo "Updated. Run ./scripts/smoke-test.sh to verify."
