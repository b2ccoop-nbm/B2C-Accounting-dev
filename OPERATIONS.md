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

## Integration smoke (production)

```bash
curl -s "$ACCOUNTING_API_URL/health"
curl -s -X POST "$ACCOUNTING_API_URL/integrations/v1/journal-events" \
  -H "Authorization: Bearer $INTEGRATION_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"membership.initial_fees","externalId":"smoke:initial_fees","participantId":"'\"$UUID\"'","occurredAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","amount":1500,"currency":"PHP","memo":"smoke test"}'
```

Replay same `externalId` — expect HTTP `200` / `already_posted`.
