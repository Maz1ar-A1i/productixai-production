#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose -f compose.yml up -d
echo
echo "Stack starting. Follow logs with: docker compose -f compose.yml logs -f"
echo "Check status with: ./scripts/status.sh"
