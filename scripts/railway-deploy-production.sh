#!/usr/bin/env bash
# Production deploy: Railway API + optional Cloudflare Pages UI.
# Used locally (after railway:setup once) and by GitHub Actions on push to main.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
SERVICE_NAME="${RAILWAY_SERVICE_NAME:-b2ccoop-accounting}"
API_URL="${ACCOUNTING_API_URL:-https://b2ccoop-accounting-production.up.railway.app}"
API_URL="${API_URL%/}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-600}"
DEPLOY_UI="${DEPLOY_UI:-1}"
WIRE_WEBAPP="${WIRE_WEBAPP:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

require_cmd railway
require_cmd curl

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  export RAILWAY_TOKEN
elif [[ "${CI:-}" == "true" ]]; then
  echo "RAILWAY_TOKEN is required in CI (Railway project token)." >&2
  exit 1
elif ! railway whoami >/dev/null 2>&1; then
  echo "Run: railway login   (or set RAILWAY_TOKEN for CI)" >&2
  exit 1
fi

cd "$BACKEND"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "==> Prisma migrate deploy"
  npx prisma migrate deploy
elif [[ -f "$BACKEND/.env" ]]; then
  echo "==> Prisma migrate deploy (from backend/.env)"
  npx prisma migrate deploy
fi

echo "==> Railway deploy (service: ${SERVICE_NAME})"
if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  railway up --service="$SERVICE_NAME" --detach
else
  railway service link "$SERVICE_NAME" 2>/dev/null || true
  railway up --detach
fi

echo "==> Health check ${API_URL}/health"
start=$(date +%s)
until code=$(curl -sS -o /tmp/accounting-health.json -w '%{http_code}' "${API_URL}/health" 2>/dev/null || echo "000"); [[ "$code" == "200" ]]; do
  now=$(date +%s)
  if (( now - start > HEALTH_TIMEOUT_SEC )); then
    echo "Timed out (last HTTP ${code})." >&2
    railway logs 2>&1 | tail -30 >&2 || true
    exit 1
  fi
  echo "  $(date +%H:%M:%S) HTTP ${code}"
  sleep 15
done
cat /tmp/accounting-health.json
echo ""

if [[ "$DEPLOY_UI" == "1" ]]; then
  echo "==> Cloudflare Pages UI"
  ENV_PROD="$ROOT/frontend/.env.production"
  if [[ "${CI:-}" == "true" ]]; then
    {
      echo "VITE_API_BASE_URL=${API_URL}"
      [[ -n "${VITE_WEBAPP_URL:-}" ]] && echo "VITE_WEBAPP_URL=${VITE_WEBAPP_URL}"
      [[ -n "${VITE_FIREBASE_API_KEY:-}" ]] && echo "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}"
      [[ -n "${VITE_FIREBASE_AUTH_DOMAIN:-}" ]] && echo "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}"
      [[ -n "${VITE_FIREBASE_PROJECT_ID:-}" ]] && echo "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}"
      [[ -n "${VITE_FIREBASE_STORAGE_BUCKET:-}" ]] && echo "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}"
      [[ -n "${VITE_FIREBASE_MESSAGING_SENDER_ID:-}" ]] && echo "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}"
      [[ -n "${VITE_FIREBASE_APP_ID:-}" ]] && echo "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}"
    } > "$ENV_PROD"
  elif [[ -f "$ROOT/frontend/.env" ]]; then
    cp "$ROOT/frontend/.env" "$ENV_PROD"
    if [[ "$(uname)" == Darwin ]]; then
      sed -i '' "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${API_URL}|" "$ENV_PROD"
    else
      sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${API_URL}|" "$ENV_PROD"
    fi
  else
    echo "VITE_API_BASE_URL=${API_URL}" > "$ENV_PROD"
  fi
  export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
  export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
  (cd "$ROOT/frontend" && npm ci && npm run pages:deploy:prod)
fi

if [[ "$WIRE_WEBAPP" == "1" && -f "$ROOT/../B2C-PMES/frontend/wrangler.b2ccoop-webapp.jsonc" ]]; then
  echo "==> PMES Worker secrets"
  ACCOUNTING_API_URL="$API_URL" bash "$ROOT/scripts/wire-webapp-accounting.sh"
fi

echo "Production deploy complete: ${API_URL}"
