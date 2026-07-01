# Medica

USMLE question-bank and flashcard platform. Full-stack TypeScript — Express 5 backend, React 19 frontend.

## Architecture

```
medica-app/   React 19 + Vite frontend         (dev: :5173)
server/       Express 5 + PostgreSQL backend   (dev: :4000)
```

## Prerequisites

- Node.js 24+
- Docker (for PostgreSQL 16 and optional Redis)

## Quick Start

```bash
# 1. Start the database
docker compose up -d

# 2. Backend
cd server
cp .env.example .env         # set JWT_SECRET, DATABASE_URL
npm install
npm run db:bootstrap         # schema + all migrations (first run only)
npm run dev                  # hot-reload on :4000

# 3. Frontend (new terminal)
cd medica-app
cp .env.example .env         # set VITE_BACKEND_URL=http://localhost:4000
npm install
npm run dev                  # Vite dev server on :5173
```

## Full Quality Gate

Run this before every PR. All steps must pass.

```bash
# Backend
cd server
npm test                     # unit tests (no Docker needed)
npm run test:integration     # PostgreSQL integration tests
npm run build                # TypeScript compile

# Frontend
cd medica-app
npm test -- --no-file-parallelism   # unit tests
npm run lint                         # ESLint
npm run build                        # Vite production build

# E2E
cd medica-app
npm run test:e2e             # 36 Playwright tests
```

## Integration Tests

Tests run against a real PostgreSQL instance.

**With local Docker (recommended):**
```bash
docker compose up -d
cd server && npm run test:integration
```

**Without Docker:** Testcontainers automatically pulls `postgres:16-alpine` on first run.

**In CI:** `TEST_PG_URL` is set to the GitHub Actions postgres service — Testcontainers is skipped.

## E2E Tests

**Requirements:** PostgreSQL on `localhost:5432`, ports 4001 and 5173 free.

```bash
cd medica-app && npm run test:e2e
```

`npm run test:e2e` = `node e2e/setup-db.mjs && playwright test`:

1. `setup-db.mjs` kills stale processes on :4001/:5173, drops and recreates `medica_e2e`, applies schema + migrations
2. Playwright starts the backend on :4001 and Vite on :5173
3. `global-setup.ts` creates one shared authenticated user
4. All 36 tests run against Chromium
5. `global-teardown.ts` drops `medica_e2e`

**Install Playwright browsers (first time):**
```bash
cd medica-app && npx playwright install chromium --with-deps
```

## CI

GitHub Actions runs the full quality gate on every push to `main` and every PR.
Three jobs: `backend`, `frontend`, `e2e` (e2e runs after backend+frontend pass).

See `.github/workflows/ci.yml`.

## Port Reference

| Port | Service                          |
|------|----------------------------------|
| 4000 | Backend (dev)                    |
| 4001 | Backend (E2E)                    |
| 5173 | Frontend (dev + E2E)             |
| 5432 | PostgreSQL                       |
| 5050 | pgAdmin (Docker, optional)       |
| 6379 | Redis (Docker, optional)         |

## Troubleshooting

**E2E tests fail with "port already in use":**
`setup-db.mjs` kills stale processes on :4001 and :5173 automatically on Windows. On Linux, kill them manually before running.

**`medica_e2e` missing or stale:**
`setup-db.mjs` drops and recreates it on every run — no manual cleanup needed.

**Integration tests fail with connection refused:**
```bash
docker compose up -d        # ensure postgres container is running
docker compose ps           # verify healthy status
```

**Playwright browsers not installed:**
```bash
cd medica-app && npx playwright install chromium --with-deps
```
