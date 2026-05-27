# Local development

## Prerequisites

- Node.js 20+
- Docker (for Postgres)
- Firebase project **`b2ccoop-87114`** (same as WebApp)

## Services

| Service | Command | URL |
|---------|---------|-----|
| Accounting Postgres | `cd backend && npm run db:up` | `localhost:5433` |
| Accounting API | `cd backend && npm run dev` | http://localhost:3010 |
| Accounting UI | `cd frontend && npm run dev` | http://localhost:5174 |
| WebApp API (optional) | `cd ../B2C-PMES/backend && npm run dev` | http://localhost:3000 |
| WebApp UI (optional) | `cd ../B2C-PMES/frontend && npm run vite:dev` | http://localhost:5173 |

## Environment

- **backend/.env** — copy from `backend/.env.example`. Use the same `ADMIN_JWT_SECRET` as WebApp if you want staff JWTs from `POST /auth/admin/login` to work on integration endpoints.
- **INTEGRATION_SERVICE_SECRET** — long random string for machine posts from WebApp workers or scripts.
- **frontend/.env** — `VITE_API_BASE_URL` + `VITE_FIREBASE_*` matching WebApp.

## Staff access

Accounting maintains its own `StaffUser` table. After migrate + seed:

1. Open Prisma Studio: `cd backend && npx prisma studio`
2. Create `StaffUser` with the treasurer’s email and role `TREASURER`
3. Sign in on the UI with that Firebase email/password

## Test integration post

```bash
curl -s -X POST http://localhost:3010/integrations/v1/journal-events \
  -H "Authorization: Bearer $INTEGRATION_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "membership.initial_fees",
    "externalId": "participant:00000000-0000-4000-8000-000000000001:initial_fees",
    "participantId": "00000000-0000-4000-8000-000000000001",
    "occurredAt": "2026-05-27T10:00:00.000Z",
    "amount": 1500,
    "currency": "PHP",
    "memo": "Share + membership fee",
    "metadata": { "memberIdNo": "B2C-TEST", "email": "member@example.com" }
  }'
```

Replay the same request — expect HTTP `200` and `"status":"already_posted"`.

## After Prisma migrations

```bash
cd backend
npx prisma migrate deploy   # or: npx prisma migrate dev
npx prisma generate         # required — also runs via npm run predev / postinstall
npm run dev                 # port 3010 only — stop duplicate nodemon if EADDRINUSE
```

If the UI shows **Failed to fetch** on sign-in, the API is not listening on `3010` (crashed or stale Prisma client).

## WebApp ↔ Accounting (local)

| WebApp `backend/.env` | Accounting `backend/.env` |
|-----------------------|---------------------------|
| `ACCOUNTING_API_URL=http://localhost:3010` | `INTEGRATION_SERVICE_SECRET` = same value as WebApp `ACCOUNTING_INTEGRATION_SECRET` |
| `ACCOUNTING_INTEGRATION_SECRET=…` | |
| `INITIAL_MEMBERSHIP_FEE_AMOUNT=1500` | |

| WebApp `frontend/.env` | |
|------------------------|---|
| `VITE_ACCOUNTING_APP_URL=http://localhost:5174` | Staff **Treasury** button on admin master list |

**Initial fees:** Treasurer marks fees paid in WebApp → `POST /integrations/v1/journal-events` (`membership.initial_fees`) → Dr Cash · Cr Share capital.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ERR_CONNECTION_REFUSED` :3010 | `cd backend && npx prisma generate && npm run dev` |
| `journalSequence does not exist` on API start | `npx prisma generate` then restart |
| `EADDRINUSE` :3010 | Kill other nodemon: `lsof -i :3010` |
| Print/PDF blank | Hard refresh UI; allow pop-ups for localhost |
| Fee paid but no JV | Check WebApp `ACCOUNTING_API_URL` + secret; open Accounting **Journals** |

```bash
./scripts/check-dev.sh
```
