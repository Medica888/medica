# Medica — Production Deployment Guide

## Prerequisites

- Node.js 24+
- PostgreSQL 16 (managed or self-hosted)
- SMTP relay (AWS SES, SendGrid, Mailgun, etc.)
- Optional: Redis 7 (for multi-instance rate-limit sharing)

---

## Required Environment Variables

### Backend (`server/.env`)

All of these must be set before starting the server in production. Missing or unsafe values cause an immediate startup failure.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | Must be `production` |
| `PORT` | no | Defaults to `4000` |
| `JWT_SECRET` | yes | Min 32 random bytes. Must not be the dev default. |
| `DATABASE_URL` | yes | Full PostgreSQL connection string |
| `ALLOWED_ORIGINS` | yes | Comma-separated HTTPS domains (no localhost) |
| `APP_BASE_URL` | yes | Non-localhost HTTPS URL (used for email links) |
| `SMTP_HOST` | yes | SMTP server hostname |
| `SMTP_PORT` | no | Defaults to `587` |
| `SMTP_USER` | no | SMTP credentials (required by most relays) |
| `SMTP_PASS` | no | SMTP credentials (required by most relays) |
| `EMAIL_FROM` | yes | Sender address (e.g. `noreply@medica.app`) |
| `ANTHROPIC_API_KEY` | yes* | Required for AI question/flashcard generation |
| `TRUST_PROXY` | no | Set to `1` behind one reverse proxy/load balancer |
| `REDIS_URL` | no | Required for multi-instance rate-limit sharing |
| `ADMIN_USER_IDS` | no | Comma-separated UUIDs. All admin routes return 403 if unset. |

> *If `ANTHROPIC_API_KEY` is not set, AI generation endpoints return `503 PROVIDER_UNAVAILABLE`. The rest of the app works.

### Frontend (`medica-app/.env`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_BACKEND_URL` | yes | Full URL to the backend API (e.g. `https://api.medica.com`) |
| `VITE_USE_BACKEND` | yes | Must be `true` in production |

---

## Deployment Order

Follow this order on every deploy. Swapping steps 2 and 3 is the most common cause of runtime crashes.

### 1. Build

```bash
# Backend
cd server && npm ci && npm run build

# Frontend
cd medica-app && npm ci && npm run build
```

### 2. Run database migrations

**Always run migrations before restarting the application server.**

```bash
cd server
DATABASE_URL=<your-prod-url> npm run migrate
```

This is idempotent — safe to re-run. It applies only the migrations that are not yet recorded in `pgmigrations`.

### 3. Seed the authored QBank catalog

Only needed the first time, and again whenever `medica-app/src/lib/questionBanks/*.js` changes:

```bash
cd medica-app && npm run export:authored-questions
cd ../server && DATABASE_URL=<your-prod-url> npm run db:seed-authored
```

This upserts the bundled authored question bank into `questions` (`source='authored'`) so `GET /api/qbank/catalog` has data to serve. It's idempotent — safe to re-run.

### 4. Start (or restart) the application server

```bash
cd server && node dist/index.js
```

The server validates the schema at startup (`validateSchema()`). If a required table is missing, it refuses to start and prints the exact migration command to run.

---

## Health Checks

| Endpoint | Purpose | Expected response |
|---|---|---|
| `GET /api/health` | Liveness — always succeeds if the process is up | `200 {"ok":true}` |
| `GET /api/ready` | Readiness — fails if DB is unreachable | `200 {"ready":true}` or `503 {"ready":false}` |

Configure your load balancer to use `/api/ready` to gate traffic. Use `/api/health` for the process liveness probe.

---

## Database Backup and Rollback

### Before deploying

```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Rolling back a migration

Each migration has a working `down` function:

```bash
cd server
DATABASE_URL=<your-prod-url> npm run migrate:down
```

Run once per migration you need to undo. Re-run until back to the desired version.

### Rolling back the application

1. Undo the migration(s) added by the new version (see above).
2. Deploy the previous build artifact.
3. Restart the server.

---

## Cookie and CORS Requirements

SameSite=Lax cookies require the frontend and API to share the same eTLD+1 domain. Example:

- `APP_BASE_URL=https://app.medica.com`
- `ALLOWED_ORIGINS=https://app.medica.com`

Both are under `medica.com` — this works.

A cross-domain setup (e.g. `app.medica.com` + `api.otherdomain.com`) will fail the startup guard and refuse to start. Deploy frontend and API under the same base domain.

---

## Production Smoke Test Checklist

Run these manually after every production deploy before directing traffic.

- [ ] `GET /api/health` returns `200 {"ok":true}`
- [ ] `GET /api/ready` returns `200 {"ready":true}`
- [ ] Register a new account → receives verification email
- [ ] Log in → session cookie is set (`medica_session`, HttpOnly, Secure, SameSite=Lax)
- [ ] Log out → cookie is cleared
- [ ] Request password reset → receives reset email with working link
- [ ] Generate an exam (requires `ANTHROPIC_API_KEY`) → questions returned
- [ ] Complete an exam → analytics updated
- [ ] Flashcard generation → cards appear
- [ ] QBank page loads authored questions from the backend (not just the local fallback)
- [ ] Admin route (`/api/admin/taxonomy-candidates`) → 403 if `ADMIN_USER_IDS` unset, 200 if set

---

## Common Failures

**Server refuses to start with `[config]` error**
One of the required environment variables is missing or unsafe. The error message names the exact variable. Set it and restart.

**Server refuses to start with `[schema] Required schema elements are missing`**
Migrations have not been applied. Run `DATABASE_URL=<url> npm run migrate` and restart.

**`/api/ready` returns 503**
The database is unreachable. Check `DATABASE_URL`, network access, and PostgreSQL service health.

**AI endpoints return 503 PROVIDER_UNAVAILABLE**
`ANTHROPIC_API_KEY` is not set or is invalid.

**Password reset / verification emails not arriving**
Check `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. Test the SMTP credentials independently. Check spam folders.

**Cookie not sent on API requests (CORS error)**
`ALLOWED_ORIGINS` does not include the frontend origin, or the frontend and API are on different base domains. Both must share the same eTLD+1.
