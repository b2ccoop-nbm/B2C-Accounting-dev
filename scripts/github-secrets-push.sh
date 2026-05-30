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

echo "CLOUDFLARE_API_TOKEN: create at https://dash.cloudflare.com/profile/api-tokens"
echo "  (Edit Cloudflare Workers + Pages Edit) and add manually in GitHub Secrets."

gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CF_ACCOUNT_ID" --repo "$REPO"
echo "Set CLOUDFLARE_ACCOUNT_ID"
echo "Done. DATABASE_URL, DIRECT_URL, RAILWAY_TOKEN must be set manually in GitHub if not already."
