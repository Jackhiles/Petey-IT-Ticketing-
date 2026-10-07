# Petey

Petey is an open-source, self-hosted IT service desk for small IT teams, modeled on
ManageEngine ServiceDesk Plus. Requesters raise tickets by email or a self-service
portal, technicians work them against SLAs, and admins configure the rules. It ships
as one `docker compose up`.

> **Status:** early development. Phase 0 (foundation) is in place: the app boots,
> connects to Postgres and serves a health page. See [`docs/PLAN.md`](docs/PLAN.md)
> for the roadmap and [`CHANGELOG.md`](CHANGELOG.md) for progress.

## Quick start

Requirements: Docker with the Compose plugin (v2.20 or newer).

```sh
git clone https://github.com/jackhiles/petey-it-ticketing-.git petey
cd petey
cp .env.example .env     # set APP_SECRET and POSTGRES_PASSWORD
docker compose up --build
```

Open <http://localhost:3000>. The health page shows whether the web app can reach
the database; `GET /api/health` returns the same as JSON. The web container applies
database migrations on start, and the worker starts once the web app is healthy.

## Architecture

One TypeScript codebase, two processes, one database:

| Service  | What it does                                                       |
| -------- | ------------------------------------------------------------------ |
| `web`    | Next.js server: technician app, requester portal, admin, `/api/v1` |
| `worker` | pg-boss jobs: IMAP polling, outbound email, SLA timers, automation |
| `db`     | PostgreSQL 16: application data, job queue and full-text search    |

```
apps/web        Next.js app
apps/worker     pg-boss job handlers
packages/core   domain services (all business logic)
packages/db     Prisma schema, migrations, client
docker/         Dockerfile and compose.yml
docs/           plan, install and architecture notes
```

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE). If you run a modified Petey as a network service, you must
offer its source to your users.
