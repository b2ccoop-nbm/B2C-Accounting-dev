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

### Accounting API (Railway)

- `DATABASE_URL` / `DIRECT_URL` — Supabase Postgres (`b2ccoop_accounting`)
- `ADMIN_JWT_SECRET` — staff session JWT (match WebApp if sharing admin login)
- `INTEGRATION_SERVICE_SECRET` — WebApp → Accounting machine auth
- `FIREBASE_*` — same project as WebApp (`b2ccoop-87114`)
- `PORT` — set by Railway automatically (do not hardcode in dashboard)
- `CORS_ORIGIN` — `https://finance.b2ccoop.com,https://b2ccoop-accounting-ui.pages.dev`
- `WEBAPP_API_URL` — `https://b2ccoop-webapp.nmatunog.workers.dev/api`

### Accounting UI (Cloudflare Pages)

- `VITE_API_BASE_URL` — Railway public URL (no trailing slash)
- `VITE_FIREBASE_*` — same as WebApp

### WebApp

- `ACCOUNTING_API_URL` — production Accounting API base (same as `VITE_API_BASE_URL`)
- `ACCOUNTING_INTEGRATION_SECRET` — same as `INTEGRATION_SERVICE_SECRET`
- `INITIAL_MEMBERSHIP_FEE_AMOUNT` — default `1500`
- `VITE_ACCOUNTING_APP_URL` — `https://finance.b2ccoop.com`

## Deploy checklist (production)

**Database:** Supabase (see `backend/.env`). Migrations:

```bash
cd backend && npx prisma migrate deploy
```

### 0. Automated setup (recommended)

```bash
npm i -g @railway/cli
railway login
cd B2C-Accounting
npm run railway:setup
```

This pushes env vars (batched), deploys the API, waits for `/health`, updates `frontend/.env.production`, deploys Pages UI, and wires PMES Worker secrets.

Production API URL: `https://b2ccoop-accounting-production.up.railway.app`

Manual steps if needed:

```bash
npm run railway:env
npm run deploy:api
npm run deploy:ui
npm run wire:webapp
```

### 1. API — Railway

```bash
cd backend
railway up --detach
curl -fsS "$ACCOUNTING_API_URL/health"
```

`backend/Dockerfile` + `backend/railway.toml` define the build. Railway sets `PORT`; Nest reads it from the environment.

### 2. UI — Cloudflare Pages (`b2ccoop-accounting-ui`)

```bash
cd frontend
# .env.production: VITE_API_BASE_URL=<Railway URL> + VITE_FIREBASE_*
export ACCOUNTING_API_URL=https://YOUR-SERVICE.up.railway.app
npm run pages:deploy:prod
```

Attach custom domain **`finance.b2ccoop.com`** in Pages → **b2ccoop-accounting-ui** → Custom domains.

### 3. Wire WebApp Worker (`b2ccoop-webapp`)

```bash
cd ../B2C-PMES/frontend
wrangler secret put ACCOUNTING_API_URL -c wrangler.b2ccoop-webapp.jsonc
wrangler secret put ACCOUNTING_INTEGRATION_SECRET -c wrangler.b2ccoop-webapp.jsonc
```

Rebuild/redeploy WebApp UI with `VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com`.

### 4. Smoke test

1. `GET /health` on Accounting API  
2. Staff sign-in on Accounting UI  
3. WebApp: Treasurer confirms fees → JV in Accounting; Coop store checkout → marketplace JV

**Every production push** (GitHub `main` on `b2ccoop-nbm/B2C-Accounting`):

Workflow [`.github/workflows/deploy-production.yml`](./.github/workflows/deploy-production.yml) runs `scripts/railway-deploy-production.sh` (Railway API + Cloudflare Pages).

**One-time GitHub secrets** (repo → Settings → Secrets → Actions):

| Secret | Purpose |
|--------|---------|
| `RAILWAY_TOKEN` | Project token from Railway → project → Settings → Tokens |
| `DATABASE_URL` | Supabase pooled URL (for `prisma migrate deploy` in CI) |
| `DIRECT_URL` | Supabase direct URL |
| `CLOUDFLARE_API_TOKEN` | **API Token** from [Cloudflare → Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) (template: **Edit Cloudflare Workers**; must include **Account → Cloudflare Pages → Edit**). **Not** the Wrangler OAuth token from your laptop. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id (`66e72ecb625c7e76d017a366156ec53f` for this team) |
| `VITE_FIREBASE_*` | Same six vars as `frontend/.env` |

**Manual / local production deploy** (same script as CI):

```bash
nvm use    # .nvmrc → Node 22 (required for wrangler pages deploy)
npm run deploy:prod
```

**CI / deploy troubleshooting**

| Symptom | Fix |
|---------|-----|
| `Wrangler requires at least Node.js v22` | `nvm install 22 && nvm use` (or Volta/fnm) before `npm run deploy:prod` |
| `npx prisma` / Prisma 7 `url` no longer supported | Script runs `npm ci` + `npm exec prisma` in `backend/` — do not run bare `npx prisma` from an empty tree |
| Cloudflare `Authentication failed` / code `9106` in Actions | Replace `CLOUDFLARE_API_TOKEN` with a dashboard **API Token** (not Wrangler OAuth) |
| `Invalid format for Authorization header` / code `6111` | Secret has quotes or a pasted **curl** line — run `bash scripts/cloudflare-token-setup.sh` |

**Set Cloudflare token (interactive, recommended):**

```bash
bash scripts/cloudflare-token-setup.sh
```

Or pass the token without an interactive prompt (paste-friendly):

```bash
# Replace the quotes with the FULL string Cloudflare shows once (copy all of it).
CLOUDFLARE_API_TOKEN='<paste-full-token-from-cloudflare-dashboard>' bash scripts/cloudflare-token-setup.sh
```

Cloudflare’s copy box already includes the `cfut_` prefix — **paste that whole string**. Do **not** type `cfut_` yourself before pasting (that causes `cfut_cfut_...`). Do not paste the “test with curl” example.

## Post-deploy (in order)

After CI is green (`deploy-api` + `deploy-ui`):

### 1. Custom domain `finance.b2ccoop.com`

```bash
export CLOUDFLARE_API_TOKEN='paste-full-token'
npm run pages:domain
```

Or Cloudflare Dashboard → **Pages** → **b2ccoop-accounting-ui** → **Custom domains** → add `finance.b2ccoop.com`.

If `b2ccoop.com` DNS is in Cloudflare, the wizard usually adds the CNAME automatically. Otherwise: CNAME `finance` → `b2ccoop-accounting-ui.pages.dev`.

### 2. Wire PMES WebApp

Pages-only API tokens **cannot** set Worker secrets. Use **`wrangler login`** (OAuth) in PMES, or an API token with **Workers Scripts → Edit**:

```bash
unset CLOUDFLARE_API_TOKEN   # if set to Pages-only token
cd ../B2C-PMES/frontend && npx wrangler login
cd ../../B2C-Accounting && npm run wire:webapp
```

Redeploy WebApp UI with Accounting link:

```bash
cd ../B2C-PMES/frontend
# .env.production (create or append)
# VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com
npm run pages:deploy:safe
```

### 3. Smoke test

```bash
npm run smoke:prod
```

Manual: staff sign-in on Accounting UI; WebApp Treasurer fee → JV; coop store → marketplace JV.

**Accounting staff login** (separate from PMES roles): Firebase sign-in + row in Postgres `StaffUser`. PMES “superuser” does not auto-grant Accounting access.

```bash
cd backend
node scripts/add-staff.js someone@example.com SUPERUSER   # or ADMIN, TREASURER, ACCOUNTANT, GENERAL_MANAGER, CHAIRMAN
```

**Superuser UI:** sign in at finance → **Staff access** — add email + role (Treasurer, Accountant, General Manager, Chairperson, Admin). Users need a Firebase account on the same project as the WebApp.

Uses `DATABASE_URL` from `backend/.env` (production Supabase when that file points at prod).

### 4. Housekeeping

- Revoke old Cloudflare tokens exposed in terminal history  
- `npm run railway:env` if you changed `CORS_ORIGIN` or secrets in `backend/.env`  
- `bash scripts/cloudflare-token-setup.sh` after rotating tokens  

Or run all scripted steps: `npm run post:prod`

## Resetting data later (production testing → go-live)

OK to keep current Supabase data while testing PMES ↔ Accounting in production. Before real cooperative books, reset in tiers:

| Tier | Keep | Clear |
|------|------|--------|
| **A — Journals only** | COA, `StaffUser`, posting rules, vendors/products | `Transaction`, `JournalEntry`, `IntegrationEvent`; reset `JournalSequence` |
| **B — Full ledger** | `StaffUser` | Tier A + accounts, fiscal periods, templates, vendors — then `npm run db:seed` |
| **C — New database** | — | New Supabase project; update Railway `DATABASE_URL` / `DIRECT_URL`; `prisma migrate deploy` + seed |

**Never** run `prisma migrate reset` on production (drops all tables).

Smoke tests use `externalId` like `smoke:…` — delete those rows before go-live if you want a clean trial balance.

Until cutover, treat production balances as **test data**.

## Integration smoke (production)

```bash
curl -s "$ACCOUNTING_API_URL/health"
curl -s -X POST "$ACCOUNTING_API_URL/integrations/v1/journal-events" \
  -H "Authorization: Bearer $INTEGRATION_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"membership.initial_fees","externalId":"smoke:initial_fees","participantId":"'\"$UUID\"'","occurredAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","amount":1500,"currency":"PHP","memo":"smoke test"}'
```

Replay same `externalId` — expect HTTP `200` / `already_posted`.
