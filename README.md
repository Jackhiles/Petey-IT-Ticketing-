# Petey

Petey is an open-source, self-hosted IT service desk for small IT teams, modeled on
ManageEngine ServiceDesk Plus. Requesters raise tickets by email or a self-service
portal, technicians work them against SLAs, and admins configure the rules. It ships
as one `docker compose up`.

> **Status:** early development. Users, sign-in (with two-factor) and the technician
> ticket workspace are in place; the requester portal and email come next. See [`docs/PLAN.md`](docs/PLAN.md)
> for the roadmap and [`CHANGELOG.md`](CHANGELOG.md) for progress.

## Quick start

Requirements: Docker with the Compose plugin (v2.20 or newer).

```sh
git clone https://github.com/jackhiles/petey-it-ticketing-.git petey
cd petey
cp .env.example .env     # set APP_SECRET, POSTGRES_PASSWORD and APP_URL
docker compose up --build
```

Set `APP_URL` to the address you will open Petey at, exactly as you type it in the
browser (for example `http://192.168.1.20:3080`). Sign-in only accepts requests from
that address. If you change `WEB_PORT`, change the port in `APP_URL` to match.

Open Petey in your browser. On a fresh install you are asked to create the first
admin account; from **Admin → Users** you can then add technicians and requesters.
Each role lands in its own area: requesters in the portal, technicians in the agent
workspace, admins in administration.

The web container applies database migrations and adds starter departments and
groups on start, and the worker starts once the web app is healthy. `/status` shows
whether the web app can reach the database; `GET /api/health` returns the same as JSON.

### Forgotten passwords

Outbound email arrives in a later phase. Until then, a password reset request writes
the reset link to the web container's log (`docker compose logs web`), and an admin
can also set a new password from **Admin → Users**. An admin who loses their
authenticator can be reset by another admin the same way.

### Backups

Petey keeps its data in two Docker volumes: `db-data` (the database) and `uploads`
(ticket attachments). Back up both, at the same time, so attachments match the
tickets that reference them.

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
