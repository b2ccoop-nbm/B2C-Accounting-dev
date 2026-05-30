#!/usr/bin/env bash
# Local production deploy (same steps as GitHub Actions on push to main).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ACCOUNTING_API_URL="${ACCOUNTING_API_URL:-https://b2ccoop-accounting-production.up.railway.app}"
export DEPLOY_UI="${DEPLOY_UI:-1}"
export WIRE_WEBAPP="${WIRE_WEBAPP:-0}"
bash "$ROOT/scripts/railway-deploy-production.sh"
