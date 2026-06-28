# Medica 10/10 Implementation Prompts

Use one prompt at a time. Finish, test, review, and commit each phase before starting the next.

## Prompt 1 - Identity and Learning-Data Integrity

```text
Act as a principal React and authentication engineer.

PHASE 10.0A - IDENTITY AND LEARNING-DATA INTEGRITY

AUDIT FIRST. Do not edit until you have traced cookie restoration, login, logout, 401 handling, session-history loading, mastery hooks, and every localStorage key containing user learning data.

Goal:
Ensure one authenticated user always sees only their own current data.

Required outcomes:
1. Replace the non-reactive authentication Boolean with one reactive source of truth supporting restoring, authenticated, and anonymous states.
2. Make session history, mastery, analytics, and protected panels respond correctly to login, logout, cookie restoration, account switching, and session expiry.
3. Centralize 401 handling without creating redirect loops or treating login/reset failures as expired sessions.
4. Namespace sessions, results, flashcards, reports, trusted questions, and other user-owned browser data by stable user ID.
5. Define an explicit one-time migration from anonymous data to an account. Never merge data silently.
6. Preserve HttpOnly cookie security. Do not restore JWT localStorage.

Constraints:
- Preserve existing API contracts unless a change is unavoidable and approved.
- Reuse existing auth and storage modules.
- Do not redesign UI.
- Do not delete user data without a tested migration path.

Tests required:
- Delayed /me restoration after hooks mount.
- Login and logout without page reload.
- Cookie expiry/401.
- Two users sharing one browser.
- Anonymous data migration accept/decline.
- Existing auth, session, analytics, mastery, and storage suites.

Stop and ask if database schema or existing API contracts must change.

Return: audit findings, state-flow diagram, files changed, migration behavior, tests, builds, and remaining risks.
```

## Prompt 2 - AI Reliability, Cost, and Abuse Control

```text
Act as a principal backend reliability and AI-platform engineer.

PHASE 10.0B - AI RELIABILITY, COST, AND ABUSE CONTROL

AUDIT FIRST: map every AI endpoint, authentication policy, retry/refill loop, model call, timeout, rate limit, token budget, fallback, and telemetry field.

Goal:
Bound cost and protect availability while preserving valid question generation.

Required outcomes:
- Require authenticated production users for costly generation endpoints; retain explicit development behavior only where needed.
- Add shared per-user and per-IP limits suitable for multiple server instances.
- Add global and per-user concurrency limits with bounded queue/backpressure behavior.
- Enforce request-level maximum model calls, tokens, elapsed time, and estimated cost.
- Add timeout, retry, circuit-breaker, and fallback rules with no retry storms.
- Record latency, model calls, cost estimate, accepted yield, validator rejections, repairs, fallback source, and terminal reason.
- Return stable, user-safe errors without exposing provider details.

Constraints:
- Keep validation strict; do not improve yield by weakening quality gates.
- Do not log prompts containing sensitive user data.
- Keep routes -> services -> repositories boundaries.

Tests:
- Anonymous production request, quota exhaustion, concurrent requests, provider timeout, malformed output, refill exhaustion, circuit open, fallback, and telemetry.
- Load-test plan for 50, 100, and 500 simultaneous users.

Return: threat/cost model, files changed, limits, failure matrix, test results, load results, and rollback plan.
```

## Prompt 3 - Medical Content Governance

```text
Act as a medical education quality lead, USMLE item-writing specialist, and backend architect.

PHASE 10.0C - MEDICAL CONTENT GOVERNANCE

AUDIT FIRST: trace generated, static, trusted, reported, quarantined, repaired, rejected, and restored questions. Identify which metadata is persistent and which exists only at runtime.

Goal:
Make every reusable question traceable and reviewable. Validators are quality gates, not proof of medical truth.

Required outcomes:
- Define one question lifecycle and allowed state transitions.
- Persist provenance: origin, generation model, prompt/rule-pack version, validator version, validation result, timestamps, review status, and reviewer decision.
- Revalidate a report using the report category, including wrong answer, ambiguous/insufficient clues, off-topic, bad explanation, duplicate, and technical issue.
- Prevent quarantined questions from re-entering any user's pool until resolved.
- Add clinician-review sampling, review SLA, inter-reviewer agreement, and restoration/rejection audit trail.
- Define original-content and non-affiliation policy for NBME/UWorld-style difficulty labels.
- Add dashboards for report rate, upheld rate, ambiguity, accuracy, validator escape rate, and recurrence.

Constraints:
- Do not copy proprietary question text.
- Do not claim official NBME/UWorld equivalence.
- Preserve current user report flow while making sync status truthful.

Tests:
- Every lifecycle transition, authorization, duplicate reports, threshold quarantine, revalidation by reason, restoration, rejection, and audit history.

Stop if a schema migration is needed: propose the minimal additive migration and get approval before implementation.

Return: governance model, schema proposal, files changed, lifecycle matrix, tests, and unresolved medical-review risks.
```

## Prompt 4 - PostgreSQL and End-to-End QA

```text
Act as a principal QA architect and release engineer.

PHASE 10.0D - REAL-ENVIRONMENT QUALITY ASSURANCE

AUDIT FIRST: inventory current unit tests, in-memory repositories, migrations, browser coverage, CI commands, and untested critical journeys.

Goal:
Prove the deployed system works across browser, cookies, API, PostgreSQL, migrations, and background side effects.

Required outcomes:
- Add a disposable PostgreSQL CI test environment.
- Run every migration up and down where safe, then up again.
- Add repository contract tests that run against both memory and PostgreSQL implementations.
- Add Playwright journeys for registration/login, cookie restoration, 10-question quiz, submission, full review, reporting, analytics filters, flashcard review, logout, and account switching.
- Add failure journeys for expired session, backend outage, AI timeout, insufficient questions, empty analytics range, and report-sync failure.
- Add automated accessibility checks on critical pages.
- Capture useful failure artifacts without committing browser profiles or secrets.

Constraints:
- Tests must be deterministic and cannot use paid AI calls.
- Do not weaken assertions to make CI green.
- No skipped critical tests.

Return: coverage matrix, files changed, commands, test results, runtime, flaky-test policy, and remaining gaps.
```

## Prompt 5 - API, Synchronization, and Operations

```text
Act as a distributed-systems and production-operations engineer.

PHASE 10.0E - API, SYNC, AND OPERATIONAL RELIABILITY

AUDIT FIRST: locate all fetch/API paths, environment flags, local-first writes, fire-and-forget calls, health checks, logging, shutdown behavior, and deployment assumptions.

Goal:
Make backend state and synchronization honest, observable, and recoverable.

Required outcomes:
- Use one canonical backend base URL and central API client, including streaming.
- Replace silent required-write failures with explicit local, pending, synchronized, or failed states.
- Add a bounded retry outbox with idempotency keys and conflict rules.
- Separate liveness and readiness; readiness returns 503 when required dependencies fail.
- Release database clients in finally blocks and implement graceful shutdown.
- Configure trusted proxies deliberately.
- Add structured logs, request IDs, error aggregation, and alerts for auth, SMTP, AI, database, and report-sync failures.

Constraints:
- Do not turn every local interaction into a blocking network request.
- Preserve offline-safe behavior where it is intentional.
- Never expose internal errors or secrets to clients.

Tests:
- Duplicate retries, reconnect, partial outage, shutdown, readiness failure, streaming abort, and synchronization conflict.

Return: before/after data flow, files changed, operational runbook, tests, dashboards/alerts, and failure-mode matrix.
```

## Prompt 6 - Architecture and Contract Consolidation

```text
Act as a principal TypeScript application architect.

PHASE 10.0F - ARCHITECTURE AND MAINTAINABILITY

AUDIT FIRST. Produce dependency and call graphs for the AI route, validator pipeline, result/scoring flow, storage, analytics, Dashboard, FlashcardsPage, and App. Identify real duplication before proposing abstractions.

Goal:
Reduce change risk while preserving behavior.

Required outcomes:
- Keep routes limited to validation, service calls, and responses.
- Move AI orchestration into focused existing service boundaries.
- Compose base, scope, specialty, NBME, UWorld, and medical-review validators through a typed registry/pipeline.
- Define canonical reason codes and parity tests between frontend preflight and backend authority.
- Define shared typed DTOs for questions, results, reports, mastery, and API errors.
- Split oversized frontend containers into data hooks and presentational sections only where responsibility boundaries are clear.
- Add import-boundary checks preventing routes -> repositories or UI -> raw network access.

Constraints:
- No broad rewrite.
- No new architectural layer without demonstrated value.
- Preserve all response contracts and validator behavior unless a bug is documented and tested.

Run full frontend/backend tests, lint, typecheck, and builds after every extraction stage.

Return: architecture before/after, files changed, contract matrix, behavior confirmation, tests, and remaining debt.
```

## Prompt 7 - UX, Accessibility, and Design System

```text
Act as a senior medical-product UX designer and WCAG 2.2 accessibility specialist.

PHASE 10.0G - UX, ACCESSIBILITY, AND DESIGN CONSISTENCY

AUDIT FIRST in the running app at desktop widths. Test keyboard-only use and inspect onboarding, first quiz, all modes, results, full review/reporting, analytics, flashcards, auth, errors, and empty states.

Goal:
Make Medica understandable, efficient, and WCAG 2.2 AA compliant without a visual overhaul.

Required outcomes:
- Add skip navigation and consistent visible focus.
- Support reduced motion.
- Ensure labels, accessible names, dialog focus management, and keyboard navigation.
- Give charts equivalent textual/table summaries.
- Ensure status never depends only on color.
- Replace emoji controls with the established icon library.
- Consolidate semantic colors and repeated component states into design tokens.
- Clarify authentication, generation progress, fallback source, synchronization, errors, and empty ranges.
- Validate contrast, text fit, scrolling, and non-overlap at supported desktop widths.

Constraints:
- No mobile responsiveness phase.
- Reuse existing components and styles.
- Do not hide advanced information that users need for serious study.

Tests:
- Keyboard journeys, automated accessibility checks, focused component tests, and Playwright screenshots at supported widths.

Return: Nielsen/WCAG findings, files changed, before/after screenshots, tests, and residual exceptions.
```

## Prompt 8 - Performance and Scalability

```text
Act as a principal performance engineer for React, Express, PostgreSQL, and AI workloads.

PHASE 10.0H - PERFORMANCE AND SCALE VERIFICATION

AUDIT FIRST with measurements. Do not optimize from file size or intuition alone.

Goal:
Meet explicit browser, API, database, and AI performance budgets under realistic load.

Required outcomes:
- Record route chunk sizes, initial transfer, interaction latency, long tasks, and memory behavior.
- Profile analytics rendering and question-bank loading.
- Verify every user-owned collection has a limit or pagination contract.
- Capture query plans for high-volume session, attempt, mastery, report, flashcard, and analytics queries.
- Add only evidence-backed indexes.
- Define caching for immutable trusted questions and safe aggregates.
- Load test read-heavy, write-heavy, login, reporting, and AI generation separately.
- Define p50/p95/p99 latency, error-rate, saturation, and recovery targets.

Constraints:
- Preserve correctness and validation quality.
- Do not cache user-sensitive data across users.
- Do not add an index without measuring write and storage cost.

Return: baseline, bottleneck matrix, files changed, query plans, load results for target concurrency, budgets, and remaining capacity limits.
```

## Final Release Audit Prompt

```text
Act as an independent principal product architect, security engineer, medical-content QA lead, accessibility specialist, and release manager.

Audit Medica after Phases 10.0A through 10.0H. Do not rely on phase reports alone; inspect code and rerun evidence.

Verify:
- Identity isolation and session lifecycle.
- AI abuse and cost bounds.
- Question provenance and quarantine governance.
- PostgreSQL and browser E2E coverage.
- Synchronization honesty and operational readiness.
- Architecture boundaries and validator parity.
- WCAG 2.2 AA critical journeys.
- Performance budgets under target load.

For every failed gate provide severity, evidence, user impact, exact remediation, and release-blocking status.

Return a go/no-go decision. A 10/10 rating is permitted only if every release gate has reproducible evidence. Do not award points for plans, comments, or unexecuted tests.
```

