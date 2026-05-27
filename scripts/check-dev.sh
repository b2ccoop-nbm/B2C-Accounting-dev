#!/usr/bin/env bash
# Quick local health check for B2CCoop Accounting + optional WebApp.
set -e
ACCT_API="${ACCT_API:-http://localhost:3010}"
ACCT_UI="${ACCT_UI:-http://localhost:5174}"
WEB_API="${WEB_API:-http://localhost:3000}"

echo "=== B2CCoop dev ports ==="
for url in "$ACCT_API/health" "$ACCT_UI" "$WEB_API/health"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$code" = "200" ] || [ "$code" = "304" ]; then
    echo "OK  $url"
  else
    echo "DOWN $url (HTTP $code)"
  fi
done

echo ""
echo "If Accounting API is DOWN:"
echo "  cd backend && npx prisma generate && npm run dev   # port 3010"
echo "If UI is DOWN:"
echo "  cd frontend && npm run dev                         # port 5174"
