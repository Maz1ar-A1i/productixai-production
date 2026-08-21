#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose -f compose.yml stop
echo "Stack stopped (containers kept, data volumes untouched). Use 'docker compose -f compose.yml down' to remove containers too."
