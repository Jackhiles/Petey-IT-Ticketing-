# CLAUDE.md

Guidance for Claude Code working in this repository. The full product brief is in
[`docs/PLAN.md`](docs/PLAN.md); read it before starting a phase.

## Repo at a glance

- `apps/web` — Next.js (App Router): portal, agent and admin UI, plus `/api`
- `apps/worker` — Node process running pg-boss jobs
- `packages/core` — framework-free domain services; all business logic lives here
- `packages/db` — Prisma schema, migrations, client
- `docker/` — Dockerfile and `compose.yml` (`web`, `worker`, `db`)

## Commands

```sh
pnpm install
pnpm dev            # web + worker in watch mode (needs DATABASE_URL)
pnpm lint           # ESLint + Prettier check
pnpm typecheck      # tsc --noEmit in every package
pnpm test           # Vitest (integration tests need DATABASE_URL)
pnpm test:e2e       # Playwright against a running web app
pnpm build          # production build of every package
pnpm db:migrate     # create/apply a Prisma migration in development
docker compose -f docker/compose.yml up --build
```

## Working rules for Claude Code

Work one phase at a time and stop for review at the end of each. In Phase 0, copy this section into `CLAUDE.md` and save the whole plan as `docs/PLAN.md`.

**Process**

- At the start of a phase, write a short task list for it and confirm any open question that blocks it before coding.
- Commit small, with Conventional Commits (`feat:`, `fix:`, `chore:`). One branch and one pull request per phase.
- If the plan is wrong or a better design appears, say so and propose the change. Do not silently deviate, and do not build features from later phases early.
- Before adding a dependency, check it is maintained and its license is AGPL-compatible. Prefer the standard library and existing dependencies.

**Code**

- No `any`, no `@ts-ignore` without a comment explaining why.
- Business logic only in `packages/core`. No Prisma calls from React components or route handlers.
- Every schema change is a Prisma migration committed to the repo. Never edit an applied migration.
- All input crosses a Zod schema. All HTML from email or the editor is sanitized before storage and render.
- Store all times in UTC; convert at the edge using the user's or the business-hours time zone.
- Secrets come from environment variables. Mailbox credentials are encrypted with a key from `APP_SECRET`.
- User-facing strings go through one message catalog so translation is possible later. English only in v1.

**Testing**

- Unit tests for every `core` service; integration tests run against a real Postgres, not mocks.
- SLA math, permission checks, email threading and the condition evaluator need exhaustive cases, written before the implementation.
- One Playwright flow per phase covering its acceptance criteria.

**Definition of done for a phase**

- [ ] Acceptance criteria met and demonstrated
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally and in CI
- [ ] `docker compose up` works from a clean checkout
- [ ] Docs and `CHANGELOG.md` updated; new settings added to `.env.example`
- [ ] Summary of what was built, what was deferred, and any deviation from this plan
