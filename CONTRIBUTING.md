# Contributing to Petey

Thanks for helping build Petey. This guide covers local setup and the rules every
change follows. The product brief and phase plan live in [`docs/PLAN.md`](docs/PLAN.md).

## Local setup

Requirements: Node.js 22 LTS, pnpm 10 (via `corepack enable`), and PostgreSQL 16
(or Docker).

```sh
corepack enable
pnpm install
cp .env.example .env            # then edit DATABASE_URL and APP_SECRET

# A throwaway Postgres for development (or point DATABASE_URL at your own):
docker run -d --name petey-dev-db -p 5432:5432 \
  -e POSTGRES_USER=petey -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=petey \
  postgres:16-alpine

pnpm db:deploy                  # apply migrations
pnpm dev                        # web on http://localhost:3000, plus the worker
```

Settings are read from the repository-root `.env` in development. To run the
end-to-end tests with a Chromium you already have, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`; otherwise run `pnpm exec playwright install chromium`.

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test        # needs DATABASE_URL pointing at a disposable database
pnpm build
pnpm test:e2e    # needs a running web app, see playwright.config.ts
```

CI runs the same commands on every pull request.

## Rules

- **Commits** use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- **Business logic lives in `packages/core`.** Route handlers, server actions and
  worker jobs stay thin: parse input with Zod, check permission, call a `core`
  service, return. No Prisma calls from React components or route handlers.
- **Every schema change is a Prisma migration** committed to the repo. Never edit a
  migration that has been applied.
- **TypeScript is strict.** No `any`; no `@ts-ignore` without a comment explaining why.
- **Times are stored in UTC** and converted at the edge.
- **User-facing strings** go through the message catalog so they can be translated later.
- **Tests:** unit tests for every `core` service; integration tests run against a real
  Postgres, not mocks.
- **Dependencies** must be actively maintained and AGPL-3.0-compatible. Prefer the
  standard library and what is already installed.

## License

By contributing you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0](LICENSE).
