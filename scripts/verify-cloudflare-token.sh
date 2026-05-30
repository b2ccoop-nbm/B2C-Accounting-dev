#!/usr/bin/env bash
# Verify CLOUDFLARE_API_TOKEN can manage Pages (used before CI / gh secret set).
set -euo pipefail

# shellcheck source=lib/normalize-cloudflare-token.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/normalize-cloudflare-token.sh"

TOKEN="$(normalize_cloudflare_token "${CLOUDFLARE_API_TOKEN:-}")"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-66e72ecb625c7e76d017a366156ec53f}"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-b2ccoop-accounting-ui}"

if [[ -z "$TOKEN" ]]; then
  echo "CLOUDFLARE_API_TOKEN is not set." >&2
  exit 1
fi

if [[ "$TOKEN" == oauth_* ]]; then
  echo "CLOUDFLARE_API_TOKEN looks like Wrangler OAuth — use a dashboard API Token." >&2
  exit 1
fi
if [[ "$TOKEN" == cfut_cfut_* ]]; then
  echo "CLOUDFLARE_API_TOKEN has double cfut_ prefix — use one cfut_ only (paste exactly from Cloudflare)." >&2
  exit 1
fi
if [[ ${#TOKEN} -lt 20 ]]; then
  echo "CLOUDFLARE_API_TOKEN is too short (${#TOKEN} chars). Paste the full token only." >&2
  exit 1
fi
if [[ "$TOKEN" == *"curl"* ]] || [[ "$TOKEN" == *"api.cloudflare.com"* ]]; then
  echo "CLOUDFLARE_API_TOKEN still contains a curl URL. Run: bash scripts/cloudflare-token-setup.sh" >&2
  exit 1
fi

echo "==> Verify API token"
verify=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify")
if ! echo "$verify" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
  echo "Token verify failed:" >&2
  echo "$verify" >&2
  exit 1
fi
echo "  Token active"

echo "==> Check Pages project ${PROJECT}"
pages=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}")
if echo "$pages" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
  echo "  Pages project reachable"
  exit 0
fi

echo "Pages API failed (check account id and token permissions: Account → Cloudflare Pages → Edit):" >&2
echo "$pages" >&2
exit 1
