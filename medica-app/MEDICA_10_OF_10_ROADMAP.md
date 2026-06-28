# Medica 10/10 Product Roadmap

## Objective

Move Medica from a strong MVP to a trustworthy production product without destabilizing the quiz, mastery, validator, or reporting systems.

"10/10" means every release gate below is evidenced by tests, monitoring, documented ownership, and a verified user journey. It does not mean the absence of all future work.

## Current Baseline

| Dimension | Current | Target |
|---|---:|---:|
| Core learning experience | 8.5 | 9.5+ |
| UI/UX | 8.0 | 9.5+ |
| Architecture | 7.2 | 9.0+ |
| Security | 7.0 | 9.5+ |
| Scalability | 6.2 | 9.0+ |
| Accessibility | 6.5 | 9.0+ |
| Medical-content trust | 6.5 | 9.5+ |
| Real-world QA confidence | 6.4 | 9.5+ |

## Delivery Order

### Phase 10.0A - Identity and Learning-Data Integrity

Goal: one authenticated user always sees only their own current data.

Deliverables:
- Reactive authentication state: `restoring`, `authenticated`, `anonymous`.
- Session expiry handling for centralized `401` responses.
- User-scoped local storage keys.
- Explicit anonymous-to-account data migration.
- Login, logout, account-switch, cookie-restore, and expiry tests.

Release gate:
- No stale authenticated UI after login/logout/expiry.
- No cross-user browser data leakage.

### Phase 10.0B - AI Reliability, Cost, and Abuse Control

Goal: generation remains available and financially bounded under load or attack.

Deliverables:
- Production authentication for costly generation.
- Shared per-user and per-IP rate limits.
- Generation concurrency and token/cost budgets.
- Retry policy, timeout, circuit breaker, and queue/backpressure behavior.
- Cost, latency, yield, rejection, and fallback telemetry.

Release gate:
- A load test demonstrates controlled degradation at the agreed concurrency target.
- No request can create unbounded AI spend.

### Phase 10.0C - Medical Content Governance

Goal: every reusable question has traceable quality evidence.

Deliverables:
- Question provenance and validator-version metadata.
- Lifecycle: generated -> validated -> trusted -> reported -> quarantined -> reviewed -> restored/rejected.
- Clinician-review sampling and review SLA.
- Accuracy, ambiguity, off-topic, and report-rate quality metrics.
- Clear non-affiliation and original-content policy for NBME/UWorld-style labels.

Release gate:
- Every trusted question has provenance, validation evidence, and review status.
- Reported questions cannot silently re-enter the pool.

### Phase 10.0D - Real-Environment Quality Assurance

Goal: prove that PostgreSQL, cookies, migrations, browser flows, and APIs work together.

Deliverables:
- Disposable PostgreSQL CI environment with migrations.
- PG repository contract tests.
- Browser tests for auth, quiz generation, completion, review, reporting, analytics, and flashcards.
- Accessibility checks on critical journeys.
- Failure-path tests for backend outage, expired session, AI timeout, and empty range.

Release gate:
- Unit, integration, E2E, build, lint, and typecheck all pass in CI.
- No skipped critical-path tests.

### Phase 10.0E - API, Sync, and Operational Reliability

Goal: users always know whether their work is local, synchronized, pending, or failed.

Deliverables:
- One canonical API base configuration.
- Central streaming API client.
- Sync outbox with retries and idempotency.
- Visible sync state and conflict policy.
- Correct readiness/liveness endpoints and graceful shutdown.
- Structured logs, alerting, request IDs, and production dashboards.

Release gate:
- No successful-looking UI state can hide a failed required backend write.
- Readiness returns failure when dependencies are unavailable.

### Phase 10.0F - Architecture and Maintainability

Goal: reduce change risk without redesigning working architecture.

Deliverables:
- Split AI route orchestration into existing route/service boundaries.
- Registry-based validator composition with canonical reason codes.
- Shared typed DTOs for API and result contracts.
- Break large frontend containers into hooks and presentational views.
- Add dependency-boundary checks.

Release gate:
- Routes contain transport logic only.
- No frontend/backend validator contract drift in parity tests.

### Phase 10.0G - UX, Accessibility, and Design-System Consistency

Goal: every major workflow is understandable, keyboard-accessible, and visually consistent.

Deliverables:
- WCAG 2.2 AA audit of critical journeys.
- Skip navigation, reliable focus, reduced motion, labels, and chart alternatives.
- Consistent icons and semantic status tokens.
- Clear auth, generation, fallback, sync, error, and empty states.
- User testing for first quiz, review, report, analytics, and flashcards.

Release gate:
- Critical journeys pass keyboard and automated accessibility checks.
- No status depends on color alone.

### Phase 10.0H - Performance and Scale Verification

Goal: establish measured budgets for browser, server, database, and AI work.

Deliverables:
- Frontend route/chunk and interaction budgets.
- Pagination and limits for every user-owned collection.
- Query plans and indexes for high-volume routes.
- Server and database load tests.
- Cache policy for immutable trusted questions and safe analytics aggregates.

Release gate:
- Agreed p95 latency, error-rate, and bundle budgets pass under target load.

## Definition of Done for Every Phase

1. Audit current behavior before editing.
2. Record before/after behavior and risk.
3. Keep changes additive unless a migration plan is approved.
4. Add regression tests for every fixed bug.
5. Run relevant focused tests, full suites, lint, typecheck, and builds.
6. Verify no unrelated files changed.
7. Commit the phase independently only after all gates pass.
8. Document remaining risks honestly.

## Recommended First Three Moves

1. Complete Phase 10.0A. It protects user identity and learning history.
2. Complete Phase 10.0D immediately afterward. It converts confidence from unit-test confidence into deployment confidence.
3. Run Phases 10.0B and 10.0C before exposing the product to substantial public traffic.

