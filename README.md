# B2CCoop Accounting

Separate product for cooperative ledger, chart of accounts, journals, and treasurer reports. Links to **B2CCoop WebApp** via HTTP integration — see [ACCOUNTING-INTEGRATION.md](./ACCOUNTING-INTEGRATION.md).

## Stack

| Layer | Tech | Port (local) |
|-------|------|----------------|
| API | NestJS + Prisma + PostgreSQL | `3010` |
| UI | Vite + React + Firebase Auth | `5174` |
| Database | `b2ccoop_accounting` (Docker `:5433`) | |

## Quick start

```bash
# 1. API database
cd backend
cp .env.example .env
npm install
npm run db:up
npx prisma migrate dev --name init
npm run prisma:seed

# 2. Add at least one staff row (treasurer email)
npx prisma studio
# StaffUser: email + role TREASURER

# 3. Run API
npm run dev

# 4. UI (new terminal)
cd ../frontend
cp .env.example .env
# Fill VITE_FIREBASE_* (same as WebApp) and VITE_API_BASE_URL=http://localhost:3010
npm install
npm run dev
```

Open http://localhost:5174

Health check (all services): `./scripts/check-dev.sh`

**After migrations:** `cd backend && npx prisma generate` then restart API (`npm run dev` uses `predev` automatically).

See [DEVELOPMENT.md](./DEVELOPMENT.md) and [OPERATIONS.md](./OPERATIONS.md) (production API on **Railway**, UI on **Cloudflare Pages**).

## Integration API (WebApp → Accounting)

```http
POST /integrations/v1/journal-events
Authorization: Bearer <INTEGRATION_SERVICE_SECRET or WebApp staff JWT>
```

Idempotent on `externalId`. See [ACCOUNTING-INTEGRATION.md](./ACCOUNTING-INTEGRATION.md) for payload and `GET /integrations/v1/members/{participantId}/summary`.

## WebApp link

When deployed, set on WebApp:

```bash
VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com
```

Staff **Treasury / Accounting** menu opens that URL in a new tab.
