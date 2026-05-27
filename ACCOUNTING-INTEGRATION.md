# B2CCoop Accounting — integration with B2CCoop WebApp

Accounting is a **separate product** (own repo, own Postgres database, own deploy). This document is the contract for linking it to **B2CCoop WebApp** (`B2C-PMES` / `B2CCoop-WebApp`).

## Systems

| System | Repo (suggested) | Role |
|--------|------------------|------|
| **WebApp** | `B2CCoop-WebApp` / `B2CCoop-WebApp-dev` | Membership, PMES, LOI, pipeline, member portal |
| **Accounting** | `B2CCoop-Accounting` / `B2CCoop-Accounting-dev` | Ledger, COA, journals, treasurer reports |

**Do not** put general-ledger tables in the WebApp Prisma schema.

## Stable member key (required on every accounting line)

Use WebApp **`Participant.id`** (UUID) as `externalMemberRef` / `participantId` in accounting.

Optional display-only fields (can change; do not use as sole key):

- `memberIdNo` — public B2C member id (e.g. `B2C-…`)
- `email` — normalized lowercase in WebApp
- `callsign`, `firebaseUid`

## WebApp money events to post (MVP integration targets)

| Event | WebApp signal | Suggested accounting `source` |
|-------|---------------|-------------------------------|
| Share + membership fee received | `Participant.initialFeesPaidAt` set (Treasurer action) | `membership.initial_fees` |
| LOI pledged capital | `LoiSubmission.initialCapital` | informational / memo only until paid |
| Marketplace / store sale | Checkout webhook (Phase 2) | `commerce.sale` |

Treasurer confirmation today: staff role **`TREASURER`** (or ADMIN / SUPERUSER) via PMES admin API — see `backend/src/pmes/pmes.service.ts` (`confirm fee payment`).

## WebApp API (production)

- **Base URL (built into Vite):** `VITE_API_BASE_URL` → e.g. `https://b2ccoop-webapp.<account>.workers.dev/api`
- **Health:** `GET /api/health`
- **Member lifecycle (member token or staff):** `GET /pmes/membership-lifecycle` (rewrites to `/api/pmes/membership-lifecycle`)
- **Staff JWT:** `POST /auth/admin/login` (Nest local) or staff Firebase session on Worker

Accounting should **not** read WebApp Postgres directly in production; use HTTP APIs or explicit integration endpoints.

## Firebase (shared identity)

WebApp uses Firebase project **`b2ccoop-87114`** (`VITE_FIREBASE_PROJECT_ID`). Accounting UI/API should use the **same project** so staff can sign in once (SSO path later).

Staff roles in WebApp DB (`StaffUser.role`): `SUPERUSER`, `ADMIN`, `TREASURER`, `BOARD_DIRECTOR`, `SECRETARY`, `CHAIRMAN`, `VICE_CHAIRMAN`, `GENERAL_MANAGER`.

Accounting MVP: allow **`TREASURER`**, **`ADMIN`**, **`SUPERUSER`**; deny others unless product says otherwise.

## Environment seam (WebApp — enable when accounting UI exists)

```bash
# frontend/.env / .env.production (optional until accounting is deployed)
VITE_ACCOUNTING_APP_URL=https://finance.b2ccoop.com
```

Later: staff menu **Treasury / Accounting** opens that URL (new tab). No iframe required.

## Accounting API contract (to implement in accounting repo)

### Idempotent journal post (called from WebApp or batch job)

```http
POST /integrations/v1/journal-events
Authorization: Bearer <staff-jwt-or-service-secret>
Content-Type: application/json

{
  "source": "membership.initial_fees",
  "externalId": "participant:<uuid>:initial_fees",
  "participantId": "<Participant.id UUID>",
  "occurredAt": "2026-05-27T10:00:00.000Z",
  "amount": 1500.00,
  "currency": "PHP",
  "memo": "Share + membership fee",
  "metadata": { "memberIdNo": "B2C-…", "email": "member@example.com" }
}
```

- **`externalId`** must be unique per logical event (replay-safe).
- Respond `200` if already posted, `201` if created.

### Member sub-ledger (for portal strip later)

```http
GET /integrations/v1/members/{participantId}/summary
```

Returns balances / last payment — read-only.

### Marketplace sale (Phase 2 — multi-line, idempotent)

```http
POST /api/v1/finance/marketplace-sale
Authorization: Bearer <INTEGRATION_SERVICE_SECRET-or-staff-jwt>
Content-Type: application/json

{
  "externalId": "order:<store-order-id>",
  "occurredAt": "2026-05-28T10:00:00.000Z",
  "currency": "PHP",
  "grossAmount": 470.00,
  "salesAmount": 70.00,
  "vendorPayableAmount": 400.00,
  "vendorCode": "B2C-DEMO",
  "buyerParticipantId": "<optional Participant.id>",
  "memo": "Rice + oil bundle",
  "metadata": { "orderId": "…", "sku": "RICE-5KG" }
}
```

- **`grossAmount`** = **`salesAmount`** + **`vendorPayableAmount`** (balanced three-line post).
- Ledger: Dr **`11110`** Cash · Cr **`40310`** Sales · Cr **`21210`** AP (vendor subsidiary via `vendorId`).
- Respond `201` created / `200` already posted (same `externalId`).

Staff UI: `GET /api/v1/finance/vendors`, `GET /api/v1/finance/vendors/:code/ap-balance`.

## Local dev ports (suggested)

| Service | URL |
|---------|-----|
| WebApp API (Nest) | `http://localhost:3000` |
| WebApp UI (Vite) | `http://localhost:5173` |
| Accounting API | `http://localhost:3010` |
| Accounting UI | `http://localhost:5174` |

## Databases

| App | DB name (local Docker) |
|-----|-------------------------|
| WebApp | `b2ccoop_webapp` |
| Accounting | `b2ccoop_accounting` (new) |

Production: separate Neon databases (or separate schemas in one Neon project — prefer **separate DB** for blast radius).

## Related docs in this repo

- [OPERATIONS.md](./OPERATIONS.md) — Cloudflare deploy
- [RENAME-CUTOVER.md](./RENAME-CUTOVER.md) — `b2ccoop-webapp` naming
