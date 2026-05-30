#!/usr/bin/env bash
# Set CLOUDFLARE_API_TOKEN in GitHub after verifying (avoids botched export/curl paste).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${GITHUB_REPO:-b2ccoop-nbm/B2C-Accounting}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-66e72ecb625c7e76d017a366156ec53f}"
# shellcheck source=lib/normalize-cloudflare-token.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/normalize-cloudflare-token.sh"

echo "Cloudflare API token → GitHub secret (repo: ${REPO})"
echo ""
echo "Paste ONLY the token from the Cloudflare page (one line)."
echo "Do NOT paste the curl example. Press Enter when done."
echo ""
read -rsp "API token: " PASTED
echo ""

TOKEN="$(normalize_cloudflare_token "$PASTED")"
if [[ -z "$TOKEN" ]]; then
  echo "No token received." >&2
  exit 1
fi
if [[ "$PASTED" == *"curl "* ]] || [[ "$PASTED" == *"api.cloudflare.com"* ]]; then
  echo "Note: you pasted a curl command; extracted token from it. Next time paste the token only." >&2
fi

export CLOUDFLARE_API_TOKEN="$TOKEN"
if [[ "$TOKEN" == cfut_cfut_* ]]; then
  echo "ERROR: Token still has double cfut_ prefix — paste only the value from Cloudflare (one cfut_)." >&2
  exit 1
fi
echo "Token length: ${#TOKEN} characters (prefix: ${TOKEN:0:12}...)"

bash "$ROOT/scripts/verify-cloudflare-token.sh"

echo ""
read -rp "Push to GitHub secret CLOUDFLARE_API_TOKEN? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Skipped gh secret set."
  exit 0
fi

gh secret set CLOUDFLARE_API_TOKEN --body "$TOKEN" --repo "$REPO"
echo "Updated GitHub secret. Re-run deploy:"
echo "  gh workflow run deploy-production.yml --repo ${REPO}"
