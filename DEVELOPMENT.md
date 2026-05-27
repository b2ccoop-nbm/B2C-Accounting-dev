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

## Next: WebApp hook

When Treasurer confirms fees in WebApp (`initialFeesPaidAt`), call the integration endpoint from Nest `pmes.service` or the OpenNext Worker route with `INTEGRATION_SERVICE_SECRET` and a stable `externalId` like `participant:<uuid>:initial_fees`.
