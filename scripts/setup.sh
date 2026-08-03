#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Intelligo Legal Results API — local setup"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required (recommended: >= 20)." >&2
  exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "ERROR: yarn is required. Install via: npm install -g yarn" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: Node.js >= 18 is required (found $(node -v))." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example — fill in DOCKET_ALARM_* credentials before calling the live API."
else
  echo "==> .env already exists — leaving it untouched."
fi

echo "==> Installing dependencies (yarn)"
yarn install

if command -v docker >/dev/null 2>&1; then
  echo "==> Starting Redis via docker-compose"
  docker compose up -d redis
else
  echo "WARN: docker not found — ensure Redis is reachable at REDIS_URL from .env"
fi

echo ""
echo "Setup complete. Next steps:"
echo "  1. Edit .env with real DocketAlarm credentials (for live runs only)."
echo "  2. yarn start:dev          # start API on :3000"
echo "  3. open http://localhost:3000/docs"
echo "  4. yarn test && yarn test:queue   # unit + Redis-backed queue tests"
echo ""
