# Changelog

All notable changes to Petey are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Phase 1: Users and auth

- Database tables for users, departments, groups and group members, sign-in (sessions, accounts, verifications, two-factor), settings and the audit log, with starter departments and groups seeded on a fresh install
- First-run setup screen that creates the first admin; self sign-up is disabled
- Email and password sign-in with [Better Auth](https://www.better-auth.com), sessions stored in Postgres, sign-in rate limiting, password change, and password reset (the reset link is written to the server log until outbound email arrives in Phase 4)
- Two-factor sign-in with an authenticator app for technicians and admins: QR-code enrollment, recovery codes, admin reset, and an admin setting that requires it
- `can(user, action, resource)` in `packages/core` covering the whole v1 role table, with exhaustive tests
- Area guards: requesters reach only the portal, technicians the agent area and portal, admins everything; deactivated users are signed out and blocked
- Admin screens for users (create, edit, deactivate, set password, reset two-factor), groups (create, rename, delete, members) and security settings
- Every change made through these screens writes an audit row in the same transaction
- New settings: `AUTH_RATE_LIMIT`; `APP_URL` must now match the address people use to reach Petey
- The health page moved from `/` to `/status`; `/` now sends people to setup, sign-in or their home area

### Phase 0: Foundation

- pnpm workspace with strict TypeScript, ESLint, Prettier, Vitest and Playwright
- `packages/db` with Prisma connected to PostgreSQL 16; `packages/core` with the first service (health check)
- `apps/web` (Next.js App Router, Tailwind CSS) serving a health page and `GET /api/health`
- `apps/worker` booting pg-boss against the same database
- `docker/compose.yml` running `web`, `worker` and `db` from one `docker compose up`
- GitHub Actions CI: lint, typecheck, unit/integration tests, end-to-end test, build and Docker image build
- README, AGPL-3.0 license, contributing guide, `CLAUDE.md` and the build plan in `docs/PLAN.md`
