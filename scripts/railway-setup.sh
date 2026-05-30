#!/usr/bin/env bash
# One-shot Railway API setup: link project, push env, deploy, wait for /health.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
ENV_FILE="$BACKEND/.env"
PROJECT_NAME="${RAILWAY_PROJECT_NAME:-b2ccoop-accounting}"
SERVICE_NAME="${RAILWAY_SERVICE_NAME:-b2ccoop-accounting}"
API_URL="${ACCOUNTING_API_URL:-}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-600}"

strip_quotes() {
  local v="$1"
  v="${v%$'\r'}"
  if [[ "$v" == \"*\" && "$v" == *\" ]]; then
    v="${v:1:${#v}-2}"
  elif [[ "$v" == \'*\' && "$v" == *\' ]]; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

env_val() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | sed "s/^${key}=//" | head -1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

require_cmd railway
require_cmd curl

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.example and fill in Supabase + Firebase." >&2
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Run: railway login" >&2
  exit 1
fi

cd "$BACKEND"

if ! railway status >/dev/null 2>&1; then
  echo "==> Creating Railway project: $PROJECT_NAME"
  railway init -n "$PROJECT_NAME"
fi

if ! railway service status >/dev/null 2>&1; then
  echo "==> First deploy (creates service)…"
  railway up --detach
  sleep 5
  railway service link "$SERVICE_NAME" 2>/dev/null || true
fi

if ! railway service status >/dev/null 2>&1; then
  railway service link "$SERVICE_NAME"
fi

if [[ -z "$API_URL" ]]; then
  API_URL="$(railway domain 2>/dev/null | grep -Eo 'https://[^[:space:]]+' | head -1 || true)"
fi
if [[ -z "$API_URL" ]]; then
  API_URL="https://${SERVICE_NAME}-production.up.railway.app"
fi
API_URL="${API_URL%/}"

echo "==> Pushing environment variables…"
attempt=0
until bash "$ROOT/scripts/railway-env-push.sh"; do
  attempt=$((attempt + 1))
  if [[ $attempt -ge 3 ]]; then
    echo "Failed to push variables after 3 attempts." >&2
    exit 1
  fi
  echo "Retrying variable push ($attempt/3)…"
  sleep 10
done

export ACCOUNTING_API_URL="$API_URL"
export DEPLOY_UI=1
export WIRE_WEBAPP=1
bash "$ROOT/scripts/railway-deploy-production.sh"
