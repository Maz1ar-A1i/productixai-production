#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "docker is required"; exit 1; }
docker compose version >/dev/null || { echo "docker compose plugin is required"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it and set every CHANGE_ME value before starting."
  exit 1
fi

if grep -q "CHANGE_ME" .env; then
  echo "Refusing to start: .env still has CHANGE_ME placeholders. Fill them in first."
  exit 1
fi

echo "Building images..."
docker compose -f compose.yml build

echo "Install complete. Run ./scripts/start.sh to bring the stack up."
