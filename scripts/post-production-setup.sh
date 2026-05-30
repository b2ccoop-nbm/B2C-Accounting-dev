#!/usr/bin/env bash
# Post-deploy setup in order: custom domain → wire PMES → smoke test.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step1_domain() {
  echo ""
  echo "=== Step 1: Custom domain finance.b2ccoop.com ==="
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "Set CLOUDFLARE_API_TOKEN (Account → Cloudflare Pages → Edit), then:"
    echo "  bash scripts/add-pages-custom-domain.sh"
    echo "Or add the domain in Cloudflare Dashboard → Pages → b2ccoop-accounting-ui → Custom domains."
    return 0
  fi
  bash "$ROOT/scripts/add-pages-custom-domain.sh"
  echo "If DNS is not on Cloudflare yet, add CNAME finance → b2ccoop-accounting-ui.pages.dev"
}

step2_wire() {
  echo ""
  echo "=== Step 2: Wire PMES Worker secrets ==="
  echo "Requires Wrangler auth with Workers secret permission (API token: Workers Scripts → Edit)."
  echo "Unset a Pages-only CLOUDFLARE_API_TOKEN and run: cd ../B2C-PMES/frontend && npx wrangler login"
  echo "Then:"
  echo "  npm run wire:webapp"
  echo ""
  echo "Redeploy WebApp UI with VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com (or pages.dev URL):"
  echo "  cd ../B2C-PMES/frontend"
  echo "  echo 'VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com' >> .env.production"
  echo "  npm run pages:deploy:safe"
  if npm run wire:webapp 2>/dev/null; then
    echo "  Worker secrets updated."
  else
    echo "  (wire:webapp skipped — fix Wrangler auth and re-run npm run wire:webapp)"
  fi
}

step3_smoke() {
  echo ""
  echo "=== Step 3: Smoke test ==="
  ACCOUNTING_UI_URL="${ACCOUNTING_UI_URL:-https://b2ccoop-accounting-ui.pages.dev}" \
    bash "$ROOT/scripts/smoke-production.sh"
}

step1_domain
step2_wire
step3_smoke

echo ""
echo "=== Step 4: Manual follow-ups ==="
echo "  • Staff sign-in on Accounting UI (Firebase)"
echo "  • WebApp: Treasurer fee confirm → JV in Accounting"
echo "  • Revoke old exposed Cloudflare tokens"
echo "  • Commit local script/doc changes if any"
