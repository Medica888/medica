# Render Staging Deployment

This runbook provisions Medica's first hosted staging environment from the root
`render.yaml` Blueprint.

## Staging Topology

| Resource | Render name | Public address |
|---|---|---|
| React static site | `medica-staging-web` | `https://staging.medica.education` |
| Express API | `medica-staging-api` | `https://api-staging.medica.education` |
| PostgreSQL 16 | `medica-staging-db` | Private Render network only |

The API and frontend share the `medica.education` base domain, which is required
for the production-style Secure, HttpOnly, SameSite=Lax session cookie.

Redis is intentionally omitted for staging. The backend uses its in-memory rate
limit store while it runs as a single instance. Add Render Key Value before
scaling the API beyond one instance.

## What the Blueprint Does

- Deploys only after GitHub checks pass on `main`.
- Builds the frontend and backend with Node.js 24.
- Runs database bootstrap/migrations and the idempotent 203-question seed before
  each API deploy.
- Uses `/api/ready` as the API deployment health check.
- Creates a paid PostgreSQL instance with private-network-only access.
- Generates `JWT_SECRET` in Render and prompts for all external secrets.
- Applies conservative AI request and token limits for staging.

The Blueprint does not create a production environment and does not contain any
credentials.

## 1. Create the Render Blueprint

1. Sign in to Render and connect the `Medica888/medica` GitHub repository.
2. Create a new Blueprint and select the repository's root `render.yaml`.
3. Confirm the branch is `main` and the region is Frankfurt.
4. Supply the prompted secrets in Render's dashboard:
   - `ANTHROPIC_API_KEY`
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_FROM` (recommended: `Medica <noreply@medica.education>`)
5. Do not enable `AUTH_DEV_TOKENS_ENABLED` or add secrets to Git.

Render generates `JWT_SECRET` and injects the database connection string
automatically.

## 2. Configure DNS

After Render creates both services, open each service's **Custom Domains** page.
Render displays the exact DNS target for each domain.

At the DNS provider for `medica.education`:

1. Add the Render-provided CNAME for `staging.medica.education`.
2. Add the Render-provided CNAME for `api-staging.medica.education`.
3. Remove conflicting `AAAA` records for those two names.
4. Return to Render and verify both domains.
5. Wait until Render reports valid TLS certificates for both domains.

Do not run the browser smoke tests against the default `onrender.com` frontend:
the API intentionally accepts only `https://staging.medica.education` as a CORS
origin.

## 3. Database Protection

`basic-256mb` is a paid Render PostgreSQL plan. Render provides continuous
backups and point-in-time recovery for paid databases. On a Hobby workspace the
recovery window is currently three days.

Before a migration-bearing deployment:

1. Open the database's **Recovery** page.
2. Trigger **Create export**.
3. Wait for the export to complete and download it to approved secure storage.
4. Record the export timestamp and deployed Git commit.

Do not run `migrate:down` as the first response to a production incident. Prefer
rolling the app back and restoring into a new recovery database, then validate it
before changing `DATABASE_URL`.

## 4. First Staging Verification

Verify these checks before considering a production Blueprint:

- `GET https://api-staging.medica.education/api/health` returns 200.
- `GET https://api-staging.medica.education/api/ready` returns 200 with the
  database connected.
- Registration sends a verification email.
- Login restores the Secure HttpOnly cookie after a page reload.
- Logout clears the cookie and does not show the previous user's flashcards.
- Switching accounts reloads the correct scoped flashcards.
- QBank shows 203 approved authored questions from the backend.
- A selected QBank session resolves in the requested order.
- Question reports persist and quarantine according to their thresholds.
- AI question and flashcard generation respect the staging budgets.
- Analytics and mastery data remain after a new deployment.
- Browser developer tools show no CORS, mixed-content, or cookie errors.

Run the Playwright suite against staging only after the DNS and TLS checks pass.

## 5. Rollback

For an application-only defect, use Render's rollback action to redeploy the last
known-good build.

For a schema or data defect:

1. Stop writes or disable the affected feature.
2. Create a point-in-time recovery database from before the incident.
3. Validate `/api/ready`, schema markers, authentication, QBank count, and a
   representative user workflow against the recovery database.
4. Update the API's `DATABASE_URL` to the validated recovery database.
5. Keep the original database until the incident is closed.

Production remains a separate approval step. Use `app.medica.education` and
`api.medica.education` only after staging passes this checklist.

## References

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render monorepo support](https://render.com/docs/monorepo-support)
- [Render custom domains](https://render.com/docs/custom-domains)
- [Render PostgreSQL backups](https://render.com/docs/postgresql-backups)
