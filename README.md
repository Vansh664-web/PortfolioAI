# PortfolioAI

PortfolioAI is a student portfolio workspace built with Next.js, React, TypeScript, Tailwind CSS, Prisma, and PostgreSQL. It includes account registration and sessions, student profile onboarding, a portfolio interview, portfolio editing and themes, project and resume management, career guidance, transparent portfolio scoring, publishing, consent-based analytics, and an AI assistant.

## Requirements

- Node.js 20.9 or newer and npm
- PostgreSQL 14 or newer (tested with PostgreSQL 18)
- An xAI API key, model name, and compatible API base URL for AI generation

## Local setup

```bash
npm ci
cp .env.example .env
```

Create a PostgreSQL database and a restricted application role, then set `DATABASE_URL` in `.env`. Set a random secret of at least 32 characters in `AUTH_SECRET`. Generate Prisma Client and apply committed migrations:

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open <http://localhost:3000>. Registration creates an account and a profile; onboarding progress and profile records are saved in PostgreSQL. `npm run dev` uses the development cookie setting. Production cookies are marked `Secure`, so production must be served over HTTPS.

## Environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. Use TLS for remote production databases. |
| `AUTH_SECRET` | Random signing secret, at least 32 characters. Keep it out of source control. |
| `XAI_API_KEY` | Server-only xAI credential. Never expose it with a `NEXT_PUBLIC_` prefix. |
| `XAI_MODEL` | Model identifier enabled for the account. The app sends this configured value. |
| `XAI_BASE_URL` | Compatible API base URL, optionally ending in `/chat/completions`. |
| `XAI_TIMEOUT_MS` | Optional AI request timeout, clamped to 5–120 seconds. |
| `NEXT_PUBLIC_PORTFOLIO_BASE_URL` | Canonical public base URL used in share links and portfolio URLs. |

Without the three xAI variables, profile, editor, publishing, and other non-AI features remain available; AI endpoints return a configuration error or use explicitly documented non-AI guidance where available.

## Project structure

- `src/app/` — public pages, authenticated dashboard routes, and server API handlers
- `src/components/` — shared dashboard frame, assistant, portfolio, and writing components
- `src/lib/` — database session, authentication, and xAI configuration helpers
- `prisma/schema.prisma` — data model
- `prisma/migrations/` — versioned PostgreSQL migrations
- `public/` — static assets

## Development checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```

The production build uses Next.js Webpack (`next build --webpack`) so it does not depend on Turbopack's internal socket binding. The current ESLint run still reports issues in existing feature files; see the QA report before treating lint as a clean gate.

## Production deployment

1. Provision PostgreSQL and an application role with only the permissions required for this database. Enable TLS and restrict network ingress.
2. Configure the environment variables above in the deployment secret manager. Use a distinct random `AUTH_SECRET` and set `NEXT_PUBLIC_PORTFOLIO_BASE_URL` to the HTTPS domain.
3. Install exactly from the lockfile and generate Prisma Client:

   ```bash
   npm ci
   npx prisma generate
   ```

4. Apply schema changes as a deployment/release step before serving the new application version:

   ```bash
   npx prisma migrate deploy
   ```

5. Build and serve:

   ```bash
   npm run build
   npm run start
   ```

   Put the app behind an HTTPS reverse proxy or managed platform TLS. Configure health checks, restart policy, request body limits, and platform-level rate limiting for authentication and AI routes.

### Database backups

Schedule encrypted PostgreSQL backups, retain off-host copies, and periodically test restoration into a separate database. For a logical backup with PostgreSQL client tools:

```bash
pg_dump --format=custom --no-owner --file=portfolioai-$(date +%F).dump "$DATABASE_URL"
```

Protect backup files as personal data. Store encryption keys separately and define retention/deletion policies. Do not use `prisma migrate reset` against production.

## Deployment limitations

- Password reset and email verification flows are not implemented yet.
- Custom domains are stored as settings, but DNS verification, hostname routing, and certificate provisioning require hosting-platform configuration.
- Resume PDF upload is stored on the resume record; production should use private object storage for larger volumes and lifecycle controls.
- AI operations require valid xAI credentials and a model/base URL enabled for the account. Provider-backed outputs could not be exercised without credentials.
- Analytics intentionally records events only after visitor consent; counts can therefore be lower than total traffic.
- Review the QA report for remaining automated lint, rate-limit, and UI-browser verification limitations.
