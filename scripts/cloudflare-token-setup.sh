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

PASTED="${CLOUDFLARE_API_TOKEN:-}"
if [[ -n "$PASTED" ]]; then
  echo "Using CLOUDFLARE_API_TOKEN from environment."
else
  echo "Paste the FULL token from Cloudflare’s copy box (one line)."
  echo "Do NOT type cfut_ before pasting — Cloudflare already includes it."
  echo "Do NOT paste the curl example. (Cmd+V / right-click paste works here.)"
  echo ""
  # No -s flag: silent read blocks paste in Cursor and many macOS terminals.
  read -r -p "API token: " PASTED
fi
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
  echo "ERROR: Token has cfut_ twice — you added cfut_ before a value that already started with cfut_." >&2
  echo "Paste only what Cloudflare’s Copy button gives you (one cfut_ at the start)." >&2
  exit 1
fi
echo "Token length: ${#TOKEN} characters (prefix: ${TOKEN:0:12}...)"

bash "$ROOT/scripts/verify-cloudflare-token.sh"

echo ""
read -rp "Push to GitHub secret CLOUDFLARE_API_TOKEN? [y/N] " CONFIRM
case "$CONFIRM" in
  y|Y) ;;
  *)
    echo "Skipped gh secret set."
    exit 0
    ;;
esac

gh secret set CLOUDFLARE_API_TOKEN --body "$TOKEN" --repo "$REPO"
echo "Updated GitHub secret. Re-run deploy:"
echo "  gh workflow run deploy-production.yml --repo ${REPO}"
