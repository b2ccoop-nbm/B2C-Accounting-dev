# Operations & deploy

## Local dev (daily)

| Service | Directory | Command | URL |
|---------|-----------|---------|-----|
| Accounting DB | `backend/` | `npm run db:up` | Postgres `:5433` |
| Accounting API | `backend/` | `npm run dev` | http://localhost:3010 |
| Accounting UI | `frontend/` | `npm run dev` | http://localhost:5174 |
| WebApp API | `../B2C-PMES/backend/` | `PORT=3000 npm run dev` | http://localhost:3000 |
| WebApp UI | `../B2C-PMES/frontend/` | `npm run dev` | http://localhost:5173 |

After **any** Prisma migration:

```bash
cd backend && npx prisma migrate deploy && npx prisma generate
```

Then restart the API. `npm run dev` runs `prisma generate` automatically via `predev`.

Health check:

```bash
./scripts/check-dev.sh
```

## Environment (production)

### Accounting API

- `DATABASE_URL` / `DIRECT_URL` — Neon Postgres (dedicated `b2ccoop_accounting` DB)
- `ADMIN_JWT_SECRET` — staff session JWT (match WebApp if sharing admin login)
- `INTEGRATION_SERVICE_SECRET` — WebApp → Accounting machine auth
- `FIREBASE_*` — same project as WebApp (`b2ccoop-87114`)
- `PORT` — e.g. `3010` or platform default

### Accounting UI (static / Pages)

- `VITE_API_BASE_URL` — production API URL
- `VITE_FIREBASE_*` — same as WebApp

### WebApp

- `ACCOUNTING_API_URL` — production Accounting API base
- `ACCOUNTING_INTEGRATION_SECRET` — same as `INTEGRATION_SERVICE_SECRET`
- `INITIAL_MEMBERSHIP_FEE_AMOUNT` — default `1500`
- `VITE_ACCOUNTING_APP_URL` — production Accounting UI (Treasury menu link)

## Deploy checklist

1. Run migrations on production DB: `npx prisma migrate deploy`
2. Deploy API (Nest) — verify `GET /health` → `database: connected`
3. Deploy UI — verify sign-in and `GET /ledger/journals`
4. Set WebApp `ACCOUNTING_*` and `VITE_ACCOUNTING_APP_URL`
5. Smoke test: Treasurer confirms fees → JV in Accounting; Coop store checkout → marketplace JV

## Integration smoke (production)

```bash
curl -s "$ACCOUNTING_API/health"
curl -s -X POST "$ACCOUNTING_API/integrations/v1/journal-events" \
  -H "Authorization: Bearer $INTEGRATION_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"membership.initial_fees","externalId":"smoke:initial_fees","participantId":"'\"$UUID\"'","occurredAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","amount":1500,"currency":"PHP","memo":"smoke test"}'
```

Replay same `externalId` — expect HTTP `200` / `already_posted`.
