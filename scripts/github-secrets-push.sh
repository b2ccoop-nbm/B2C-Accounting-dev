#!/usr/bin/env bash
# Push CI secrets to b2ccoop-nbm/B2C-Accounting from local .env + wrangler config.
# Requires: gh auth login as b2ccoop-nbm
set -euo pipefail

REPO="${GITHUB_REPO:-b2ccoop-nbm/B2C-Accounting}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/frontend/.env"
CF_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-66e72ecb625c7e76d017a366156ec53f}"

strip_quotes() {
  local v="$1"
  v="${v%\"}"
  v="${v#\"}"
  printf '%s' "$v"
}

gh auth status >/dev/null || { echo "Run: gh auth switch -u b2ccoop-nbm" >&2; exit 1; }

for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID; do
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -n1)
  val=$(strip_quotes "${line#*=}")
  gh secret set "$key" --body "$val" --repo "$REPO"
  echo "Set $key"
done

gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CF_ACCOUNT_ID" --repo "$REPO"
echo "Set CLOUDFLARE_ACCOUNT_ID"

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"
  bash "$ROOT/scripts/verify-cloudflare-token.sh"
  gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN" --repo "$REPO"
  echo "Set CLOUDFLARE_API_TOKEN"
else
  echo ""
  echo "Create an API token: https://dash.cloudflare.com/profile/api-tokens"
  echo "  Template: Edit Cloudflare Workers (includes Pages Edit), or custom with:"
  echo "    Account → Cloudflare Pages → Edit"
  echo "    Account → Account Settings → Read (optional, for wrangler whoami)"
  echo ""
  echo "Then verify and push to GitHub:"
  echo "  export CLOUDFLARE_API_TOKEN='paste-token-here'"
  echo "  bash scripts/verify-cloudflare-token.sh"
  echo "  gh secret set CLOUDFLARE_API_TOKEN --body \"\$CLOUDFLARE_API_TOKEN\" --repo $REPO"
fi

echo "Done. DATABASE_URL, DIRECT_URL, RAILWAY_TOKEN must be set manually in GitHub if not already."
