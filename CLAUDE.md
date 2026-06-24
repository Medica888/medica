# Medica — Development Guidelines

## Stack

**Frontend** — `medica-app/`
- React 19, Vite 8, TypeScript, Tailwind CSS v4
- Recharts for analytics charts
- `@anthropic-ai/sdk` for AI features
- Vitest + Testing Library for tests

**Backend** — `server/`
- Express 5, TypeScript, CommonJS (`"type": "commonjs"`)
- PostgreSQL 16 via `pg` pool, `node-pg-migrate` for migrations
- `bcryptjs` + JWT for auth, Zod for request validation
- `express-rate-limit` for abuse protection
- Vitest with in-memory repositories for tests (no real DB required)

---

## Environment Setup

### Backend — `server/.env`
Copy from `server/.env.example`. Required vars:
```
PORT=4000
NODE_ENV=development
JWT_SECRET=change-me-in-production
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medica
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```
Omit `DATABASE_URL` to run entirely in-memory (no Docker needed for dev/test).

### Frontend — `medica-app/.env`
Copy from `medica-app/.env.example`. Set as needed:
```
VITE_BACKEND_URL=http://localhost:4000
VITE_USE_BACKEND=true
```

### Database
```bash
docker compose up -d        # starts PostgreSQL on :5432, pgAdmin on :5050, Redis on :6379
cd server && npm run db:init # create schema (first time only)
npm run migrate              # apply pending migrations
```

### Redis (optional)
Redis backs the AI generation rate limiters for multi-instance deployments.
Omit `REDIS_URL` to use in-memory rate-limit store (fine for dev/single-instance).
```bash
docker compose up -d redis  # start Redis on :6379
# Add to server/.env:
# REDIS_URL=redis://localhost:6379
```

---

## Backend Architecture

### Layer rules — never cross them

```
Routes → Services → Repositories → DB
```

- **Routes**: parse request, call service, return response. No business logic.
- **Services**: all business logic. No direct SQL. No `req`/`res`.
- **Repositories**: all SQL. Interface + two implementations (PG and in-memory).
- Never put SQL in services. Never put business logic in repositories.

### Repository pattern

Every entity has:
- `src/repositories/interfaces.ts` — typed interface, no PG imports
- `src/repositories/pg/` — real PostgreSQL implementation
- `src/repositories/memory/` — in-memory Map implementation for tests

`tx?: unknown` is the pattern for passing a `PoolClient` through interfaces without importing PG types in the interface layer. PG implementations cast: `(tx as PoolClient | undefined) ?? null`, then use `q.query()` or fall back to a fresh pool connection.

### Transactions

Use `withTransaction` from `src/config/db.ts` for any operation that writes to multiple tables:

```typescript
return withTransaction(async (tx) => {
  const session = await this.sessions.create(sessionData, tx);
  await this.attempts.createMany(attempts, tx);
  return session;
});
```

`withTransaction` calls `fn(null)` when there is no pool (test/in-memory mode) — no special test handling needed.

### Batch inserts — use unnest, never loop

```sql
INSERT INTO table (id, user_id, ...)
SELECT unnest($1::uuid[]), unnest($2::uuid[]), ...
RETURNING *
```

Cast arrays to the correct PG type — `uuid[]` for UUID columns, `text[]` for text, `boolean[]`, `integer[]`, `timestamptz[]`. Wrong casts cause silent failures or runtime errors.

### Query safety

- Add `LIMIT` to every `findByUserId` that could return unbounded rows (default 500).
- All `:id` params must be validated with UUID regex before hitting the service layer. Return 404 on invalid format — never reveal whether a resource exists or the format was wrong.
- Pagination: guard `parseInt` against `NaN` with `|| default` fallback.

### Error handling

- Global error handler in `app.ts` catches anything that leaks past route handlers.
- Routes catch service errors by message string: `NOT_FOUND` → 404, `FORBIDDEN` → 403, else → 500.
- Never leak stack traces or internal error messages to the client.
- Fire-and-forget side effects (e.g. analytics snapshots) must use `.catch(err => console.error(...))`.

### Auth

- `requireAuth` middleware on every protected route. Applied at router level with `router.use(requireAuth)`.
- `req.userId!` is safe to use after `requireAuth`.
- Ownership checks belong in the repository query (`WHERE id=$1 AND user_id=$2`) — not as a second fetch + compare in the service.

### Validation

- All request bodies validated with Zod schemas in `src/schemas/`.
- Apply bounds to every numeric field (`.min()`, `.max()`, `.int()`), string lengths (`.max()`), and array sizes (`.min(1).max(N)`).
- Schemas live in `schemas/`, not inline in routes.

### Security

- bcrypt cost **12** in production, **10** in test (`config.nodeEnv === 'test' ? 10 : 12`).
- Email: always `email.toLowerCase().trim()` before store or lookup. Unique index on `LOWER(email)` enforces this at DB level.
- `JWT_SECRET` must be set in production — `config.ts` throws at startup if not.
- `ALLOWED_ORIGINS` must be non-localhost in production — `config.ts` throws at startup if not.

---

## Frontend Architecture

### Component rules

- One component per file. Filename matches export name.
- Presentational components receive data and callbacks as props — no API calls, no business logic inside.
- Data fetching happens in custom hooks (`useExams`, `useAnalytics`, etc.), not in components.
- Form state lives in the form component. Server state lives in hooks.
- All API calls go through a central client module — no raw `fetch` scattered across components.

### State management

- No duplicated state. Derive values from existing state rather than syncing a copy.
- No unnecessary `useEffect`. If you can derive it, derive it. If you need a sync, question whether the state is in the right place.
- Loading, error, and empty states are required for every async operation — never render stale or undefined data silently.

### API errors

- API errors surface through the hook's error state, not `console.error` and silent failure.
- Every API call has typed request and response shapes. No `any`.

### Design system

- Status tokens: `--status-critical`, `--status-warn`, `--status-stable` — never raw red/green/orange.
- Bloomberg/Apple aesthetic: dark, precise, no decoration without purpose.
- Shield logo in sidebar and loading screen.
- Accessibility: keyboard focus on every interactive element, aria labels on icon buttons, form labels connected to inputs.

### Recharts

- Wrap charts in `ResponsiveContainer` — never hardcode pixel widths.
- Tooltip and axis formatters belong in the chart component, not in the data hook.

---

## TypeScript Standards

- No `any`. Use `unknown` when the type is genuinely unknown, then narrow it.
- DTOs and domain types live in `src/types/`. Don't redefine the same shape in multiple files.
- Interfaces must not import PG types — keep them layer-neutral.
- Runtime validation (Zod) must match TypeScript types. If they diverge, fix both.
- Avoid type assertions (`as`) unless you've already narrowed by check.
- `!` non-null assertions only after a guard that makes the null case unreachable.

---

## Testing Standards

### Backend

- All tests use in-memory repositories via `setRepositories()`. No real DB, no Docker required.
- `vitest.config.ts` sets `env: { NODE_ENV: 'test', DATABASE_URL: '' }` — prevents dotenv from loading a real `DATABASE_URL`, keeps `getPool()` returning null.
- Test every error path: missing record, wrong owner, invalid input, duplicate constraint.
- New behavior gets a test. Bug fixes get a regression test.

### Frontend

- Test hooks and user-facing behavior, not implementation details or class names.
- Mock API calls at the network boundary with vitest mocks, not inside components.

### Both

- Coverage of critical paths, error branches, and auth logic is the goal — not 100% line coverage.

---

## Database Migrations

- Migrations live in `server/migrations/` as `.js` CJS files (`exports.up` / `exports.down`).
- Every migration must have a working `down` that is the exact inverse of `up`.
- Use `ifNotExists: true` on `createIndex` and `ifExists: true` on `dropIndex` — migrations must be idempotent.
- Expression indexes (e.g. `(snapshot_date::date)`) must match the `ON CONFLICT` target exactly in application code.
- Always run `npm run migrate` before deploying a server build that depends on a new migration.
- Never edit a migration that has already been applied to production. Create a new one.

---

## Commands

```bash
# Infrastructure
docker compose up -d            # start PostgreSQL (:5432) + pgAdmin (:5050)

# Backend
cd server
npm run dev                     # tsx watch, hot reload on :4000
npm run build                   # tsc — must be clean before shipping
npm test                        # vitest run, in-memory, no Docker needed
npm run db:init                 # create schema (first time only)
npm run migrate                 # apply pending migrations

# Frontend
cd medica-app
npm run dev                     # Vite dev server on :5173
npm run build                   # production build
npm test                        # vitest run
npm run lint                    # ESLint
```

---

## Skills

@skills/01-code-reviewer.md
@skills/03-medical-explainer.md
@skills/05-usmle-Test Generator.md
@skills/10-step1-mastery.md
