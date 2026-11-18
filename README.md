# PortfolioAI

PortfolioAI is a student portfolio workspace built with Next.js, React, TypeScript, Tailwind CSS, Prisma, and PostgreSQL. It includes authentication and onboarding, an AI portfolio interview and writing tools, portfolio themes and editor, project and resume management, career guidance, scoring, publishing, consent-based analytics, and an assistant.

## Requirements

- Node.js 20.9 or newer and npm
- PostgreSQL 14 or newer
- A separate PostgreSQL migration owner and a runtime role that is `NOSUPERUSER`, `NOBYPASSRLS`, and does not own application tables
- Production: Google AI Studio (Gemini) or xAI API credentials, transactional email credentials, and shared Upstash Redis REST credentials

## Local development

```bash
npm ci
cp .env.example .env
```

Set `DATABASE_URL` to a local PostgreSQL database, and set `AUTH_SECRET` to a locally generated random value of at least 32 characters. Apply migrations and start the development server:

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open <http://localhost:3000>. The workspace works without login, email delivery, or Redis; development rate limits use process-local memory. New accounts created through the API are automatically verified in development. To seed an optional developer login account after migrations, run `npm run seed:dev`; it creates `dev@portfolioai.local` with password `DevPassword123!`. Set `GEMINI_API_KEY` (or the `XAI_*` values) to enable provider-backed AI; AI endpoints return a clear configuration error when credentials are missing.

The app opens the workspace without requiring an account. Visitors without a valid session share one database-backed Guest Workspace, so changes made there are visible to other unauthenticated visitors.

## Environment configuration

Copy `.env.example` to `.env`. Keep `.env` out of version control and never use a `NEXT_PUBLIC_` prefix for secrets.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime PostgreSQL connection using the restricted, non-owner application role. |
| `AUTH_SECRET` | Private session-signing secret (minimum 32 characters). |
| `GEMINI_API_KEY` | Server-only Google AI Studio API key. Takes precedence over xAI when set. |
| `GEMINI_MODEL` | Gemini model identifier, for example `gemini-3.5-flash`. |
| `GEMINI_MODEL_FALLBACKS` | Comma-separated models tried when the primary model is retired or overloaded. |
| `GEMINI_BASE_URL` | Gemini OpenAI-compatible base URL, normally `https://generativelanguage.googleapis.com/v1beta/openai`. |
| `XAI_API_KEY` | Server-only xAI API credential, used only when `GEMINI_API_KEY` is empty. |
| `XAI_MODEL` | Model identifier enabled for the account; sent exactly as configured. |
| `XAI_BASE_URL` | xAI API base URL, normally `https://api.x.ai/v1`; may be an explicit Chat Completions URL. |
| `XAI_TIMEOUT_MS` | Optional provider timeout for either provider, clamped to 5–120 seconds. |
| `NEXT_PUBLIC_PORTFOLIO_BASE_URL` | Canonical URL used in verification, reset, and public portfolio links. Production must use HTTPS. |
| `EMAIL_PROVIDER` | Set to `resend` to enable the supported email provider. |
| `EMAIL_API_KEY` | Server-only Resend API key. |
| `EMAIL_FROM` | Verified sender address. |
| `UPSTASH_REDIS_REST_URL` | Shared production rate-limit Redis endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only Redis REST token. |

The AI integration reads the provider, model, base URL, and key from the server environment. Gemini's OpenAI-compatible endpoint is used, so no extra SDK is required. Test the live provider connection after configuring credentials with `npm run test:ai`. This makes a real provider request and is expected to fail with a clear message when credentials are absent or invalid.

## PostgreSQL roles, RLS, and migrations

The application never connects directly from the browser. Use two database roles in production:

1. A migration owner used only by the release job to run `prisma migrate deploy`.
2. A runtime role used by `DATABASE_URL`; it must not own the tables, must not be superuser, and must not have `BYPASSRLS`.

After applying migrations as the owner, grant the runtime role the minimum table privileges it needs. For example, with role names substituted for your deployment:

```sql
GRANT CONNECT ON DATABASE portfolioai TO portfolioai_app;
GRANT USAGE ON SCHEMA public TO portfolioai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portfolioai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portfolioai_app;
```

Migration `0004_row_level_security` enables and forces RLS on sessions and user-owned profile, portfolio, AI, resume, analytics, notification, and career-goal tables. Policies scope access through the PostgreSQL `app.user_id` setting. Server code verifies the signed session and runs authenticated database work through a per-user server-side connection context. The setting is never taken from a browser-supplied user ID. `User` is deliberately outside these policies because unauthenticated sign-in and registration must look up accounts; keep its credentials confined to server code, and constrain authenticated access to the signed-in user's ID. Published portfolio policies allow public reads only for published portfolio content and visible related sections/themes.

Use the migration owner, not the application role, for releases:

```bash
DATABASE_URL="$MIGRATION_DATABASE_URL" npx prisma migrate deploy
```

Do not run `prisma migrate reset` on production. Verify schema state with `npx prisma migrate status` and connectivity with your PostgreSQL client before deployment.

## Checks and integration tests

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test:ai # real provider call; requires GEMINI_API_KEY or all XAI_* values
```

Lint currently completes with warnings but no errors. The provider integration test is not a mock. The project does not currently include Playwright; browser automation dependencies could not be downloaded in this environment because npm registry DNS resolution failed. The local Chromium binary can still be used for manual screenshots and browser checks.

## Project structure

- `src/app/` — public routes, dashboard pages, and API handlers
- `src/components/` — shared dashboard, assistant, portfolio, and content editing UI
- `src/lib/` — database context, authentication, email, rate limiting, and AI service
- `prisma/schema.prisma` — PostgreSQL data model
- `prisma/migrations/` — versioned schema and RLS migrations
- `scripts/` — manual live integration checks
- `public/` — static assets

## Production deployment

1. Provision PostgreSQL with TLS and restricted network access. Set up separate migration-owner and runtime roles as described above.
2. Configure every required environment variable in the hosting secret manager. Generate `AUTH_SECRET` in that secret manager or deployment system. Set `NEXT_PUBLIC_PORTFOLIO_BASE_URL` to the HTTPS site URL.
3. Configure and verify Resend sender-domain DNS, an Upstash Redis REST database, and a Gemini (or xAI) API key/model that your account is allowed to use. Missing production rate-limit configuration fails closed.
4. Install from the lockfile, generate Prisma Client, apply migrations as a release step, then build and start:

   ```bash
   npm ci
   npx prisma generate
   DATABASE_URL="$MIGRATION_DATABASE_URL" npx prisma migrate deploy
   npm run build
   npm run start
   ```

5. Terminate TLS at a trusted hosting platform or HTTPS reverse proxy. Configure forwarded host/protocol headers accurately, health checks, request-body limits, restart policy, and appropriate platform monitoring. Do not expose PostgreSQL, Redis, API keys, or session secrets publicly.

### Backups

Create an encrypted logical backup and retain it outside the database host:

```bash
pg_dump --format=custom --no-owner --file="portfolioai-$(date +%F).dump" "$MIGRATION_DATABASE_URL"
```

Restore only into a separate database for verification:

```bash
createdb portfolioai_restore_check
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" "portfolioai-YYYY-MM-DD.dump"
psql "$RESTORE_DATABASE_URL" -c 'SELECT count(*) FROM "User";'
```

Restrict backup access, encrypt storage, define retention/deletion periods, and periodically test restoration.

## Known deployment boundaries

- Custom-domain DNS verification, host routing, and TLS certificate provisioning are hosting-platform responsibilities; the application does not provision domains.
- Resume PDF output uses browser print styling and selectable HTML text. The PDF path has not been validated across multiple Chromium/browser versions in this environment.
- Real AI output and transactional email delivery require external credentials; live AI output was verified against Gemini with a local key.
- Shared Redis is required for production multi-instance rate limiting. Development fallback is in-memory and intentionally not suitable for production.
- Analytics is opt-in and therefore reports only visitors who consent.
- npm audit could not reach `registry.npmjs.org` due DNS `EAI_AGAIN`; no clean audit result is claimed.
