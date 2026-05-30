#!/usr/bin/env bash
# Add finance.b2ccoop.com to b2ccoop-accounting-ui (Cloudflare Pages).
set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-66e72ecb625c7e76d017a366156ec53f}"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-b2ccoop-accounting-ui}"
DOMAIN="${PAGES_CUSTOM_DOMAIN:-finance.b2ccoop.com}"
TOKEN="${CLOUDFLARE_API_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN (Pages Edit)." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/normalize-cloudflare-token.sh
source "$ROOT/scripts/lib/normalize-cloudflare-token.sh"
TOKEN="$(normalize_cloudflare_token "$TOKEN")"

echo "==> Add custom domain ${DOMAIN} to ${PROJECT}"
resp=$(curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"name\":\"${DOMAIN}\"}")

if echo "$resp" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
  echo "  Domain added. Complete DNS in Cloudflare if prompted."
  echo "$resp" | grep -oE '"status":"[^"]*"' | head -3 || true
  exit 0
fi

if echo "$resp" | grep -qi 'already exists'; then
  echo "  Domain already configured on this project."
  exit 0
fi

echo "Failed:" >&2
echo "$resp" >&2
exit 1
