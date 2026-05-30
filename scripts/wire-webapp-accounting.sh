#!/usr/bin/env bash
# Set PMES production Worker secrets for Accounting integration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PMES_FRONTEND="$ROOT/../B2C-PMES/frontend"
ENV_FILE="$ROOT/backend/.env"
WRANGLER_CONFIG="$PMES_FRONTEND/wrangler.b2ccoop-webapp.jsonc"

API_URL="${ACCOUNTING_API_URL:-https://b2ccoop-accounting-production.up.railway.app}"
API_URL="${API_URL%/}"

strip_quotes() {
  local v="$1"
  v="${v%$'\r'}"
  if [[ "$v" == \"*\" && "$v" == *\" ]]; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  echo "Missing $WRANGLER_CONFIG" >&2
  exit 1
fi

line=$(grep -E '^INTEGRATION_SERVICE_SECRET=' "$ENV_FILE" | tail -n1)
SECRET="${line#INTEGRATION_SERVICE_SECRET=}"
SECRET="$(strip_quotes "$SECRET")"

if [[ -z "$SECRET" ]]; then
  echo "INTEGRATION_SERVICE_SECRET not set in backend/.env" >&2
  exit 1
fi

cd "$PMES_FRONTEND"
WRANGLER=(npx wrangler)
if [[ -x "$PMES_FRONTEND/node_modules/.bin/wrangler" ]]; then
  WRANGLER=("$PMES_FRONTEND/node_modules/.bin/wrangler")
fi

printf '%s' "$API_URL" | "${WRANGLER[@]}" secret put ACCOUNTING_API_URL -c wrangler.b2ccoop-webapp.jsonc
printf '%s' "$SECRET" | "${WRANGLER[@]}" secret put ACCOUNTING_INTEGRATION_SECRET -c wrangler.b2ccoop-webapp.jsonc

echo "PMES Worker secrets set:"
echo "  ACCOUNTING_API_URL=${API_URL}"
echo "  ACCOUNTING_INTEGRATION_SECRET=(from accounting backend/.env)"
