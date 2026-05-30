#!/usr/bin/env bash
# Verify CLOUDFLARE_API_TOKEN can manage Pages (used before CI / gh secret set).
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-66e72ecb625c7e76d017a366156ec53f}"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-b2ccoop-accounting-ui}"

if [[ -z "$TOKEN" ]]; then
  echo "CLOUDFLARE_API_TOKEN is not set." >&2
  exit 1
fi

# OAuth / wrangler session tokens are not valid API tokens (CI error 9106).
if [[ "$TOKEN" == oauth_* ]] || [[ ${#TOKEN} -lt 32 ]]; then
  echo "CLOUDFLARE_API_TOKEN looks wrong (use a dashboard API Token, not Wrangler OAuth)." >&2
  exit 1
fi

echo "==> Verify API token"
verify=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify")
if ! echo "$verify" | grep -q '"success":true'; then
  echo "Token verify failed:" >&2
  echo "$verify" >&2
  exit 1
fi
echo "  Token active"

echo "==> Check Pages project ${PROJECT}"
pages=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}")
if echo "$pages" | grep -q '"success":true'; then
  echo "  Pages project reachable"
  exit 0
fi

echo "Pages API failed (check account id and token permissions: Account → Cloudflare Pages → Edit):" >&2
echo "$pages" >&2
exit 1
