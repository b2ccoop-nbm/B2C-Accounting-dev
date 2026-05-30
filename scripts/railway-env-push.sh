#!/usr/bin/env bash
# Push backend/.env vars to the linked Railway service (batched to reduce API calls).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
BATCH_SIZE="${RAILWAY_VAR_BATCH_SIZE:-6}"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: npm i -g @railway/cli" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT/backend"
if ! railway status >/dev/null 2>&1; then
  echo "No Railway project linked. Run: npm run railway:setup" >&2
  exit 1
fi

if ! railway service status >/dev/null 2>&1; then
  echo "Link a service: railway service link b2ccoop-accounting" >&2
  exit 1
fi

strip_quotes() {
  local v="$1"
  v="${v%$'\r'}"
  if [[ "$v" == \"*\" && "$v" == *\" ]]; then
    v="${v:1:${#v}-2}"
  elif [[ "$v" == \'*\' && "$v" == *\' ]]; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

pairs=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line//$'\r'/}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  key="${BASH_REMATCH[1]}"
  val="$(strip_quotes "${BASH_REMATCH[2]}")"
  [[ "$key" == "POSTGRES_PASSWORD" ]] && continue
  pairs+=("${key}=${val}")
done < "$ENV_FILE"

pairs+=("NODE_ENV=production")
pairs+=("CORS_ORIGIN=${CORS_ORIGIN:-https://finance.b2ccoop.com,https://b2ccoop-accounting-ui.pages.dev}")
pairs+=("WEBAPP_API_URL=${WEBAPP_API_URL:-https://b2ccoop-webapp.nmatunog.workers.dev/api}")

echo "Pushing ${#pairs[@]} variables in batches of ${BATCH_SIZE}…"

i=0
while (( i < ${#pairs[@]} )); do
  batch=()
  for ((j = 0; j < BATCH_SIZE && i < ${#pairs[@]}; j++, i++)); do
    batch+=("${pairs[i]}")
  done
  attempt=0
  until railway variable set "${batch[@]}" --skip-deploys; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge 4 ]]; then
      echo "Failed setting batch starting with ${batch[0]%%=*}" >&2
      exit 1
    fi
    sleep $((attempt * 5))
  done
done

echo "Railway variables updated."
