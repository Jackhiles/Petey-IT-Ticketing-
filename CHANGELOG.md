# Changelog

All notable changes to Petey are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Phase 0: Foundation

- pnpm workspace with strict TypeScript, ESLint, Prettier, Vitest and Playwright
- `packages/db` with Prisma connected to PostgreSQL 16; `packages/core` with the first service (health check)
- `apps/web` (Next.js App Router, Tailwind CSS) serving a health page and `GET /api/health`
- `apps/worker` booting pg-boss against the same database
- `docker/compose.yml` running `web`, `worker` and `db` from one `docker compose up`
- GitHub Actions CI: lint, typecheck, unit/integration tests, end-to-end test, build and Docker image build
- README, AGPL-3.0 license, contributing guide, `CLAUDE.md` and the build plan in `docs/PLAN.md`
