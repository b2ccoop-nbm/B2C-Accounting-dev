#!/usr/bin/env bash
# Production smoke checks (API health + optional integration JV).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${ACCOUNTING_API_URL:-https://b2ccoop-accounting-production.up.railway.app}"
API_URL="${API_URL%/}"
UI_URL="${ACCOUNTING_UI_URL:-https://b2ccoop-accounting-ui.pages.dev}"
UI_URL="${UI_URL%/}"

echo "==> API health ${API_URL}/health"
health=$(curl -fsS "${API_URL}/health")
echo "$health"
echo "$health" | grep -q '"status":"ok"' || { echo "Health check failed" >&2; exit 1; }

echo "==> UI ${UI_URL}"
code=$(curl -sS -o /dev/null -w '%{http_code}' "${UI_URL}/")
echo "  HTTP ${code}"
[[ "$code" == "200" ]] || { echo "UI not reachable" >&2; exit 1; }

ENV_FILE="$ROOT/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  line=$(grep -E '^INTEGRATION_SERVICE_SECRET=' "$ENV_FILE" | tail -n1 || true)
  secret="${line#INTEGRATION_SERVICE_SECRET=}"
  secret="${secret%\"}"
  secret="${secret#\"}"
  if [[ -n "$secret" ]]; then
  UUID=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')
  echo "==> Integration journal-events (smoke)"
  resp=$(curl -sS -w '\n%{http_code}' -X POST "${API_URL}/integrations/v1/journal-events" \
    -H "Authorization: Bearer ${secret}" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"membership.initial_fees\",\"externalId\":\"smoke:${UUID}\",\"participantId\":\"${UUID}\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"amount\":1500,\"currency\":\"PHP\",\"memo\":\"production smoke\"}")
  body="${resp%$'\n'*}"
  code="${resp##*$'\n'}"
  echo "  HTTP ${code}"
  echo "  ${body}" | head -c 200
  echo ""
  [[ "$code" == "200" || "$code" == "201" ]] || { echo "Integration smoke failed" >&2; exit 1; }
  fi
fi

echo "Smoke checks passed."
