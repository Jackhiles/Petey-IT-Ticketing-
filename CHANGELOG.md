# Changelog

All notable changes to Petey are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Phase 2b: Technician productivity

- Tags, managed by admins and applied by technicians, shown on tickets, list rows and board cards, and filterable in the list
- Watchers by email address, linked to a Petey user when one exists; they start receiving updates when email arrives in Phase 4
- Merge a duplicate into another ticket, keeping every message, attachment, watcher, tag and time entry; the duplicate's description becomes a message, and it is closed and linked as merged into the target
- Split a public message out into a new ticket for the same requester, with its attachments; internal notes can't be split because a description is public
- Link tickets as parent/child or related, by number; resolving a parent can close its open children in the same step
- Canned responses with variables such as `{{requester.first_name}}` and `{{ticket.number}}`, searchable and inserted from the reply box
- Macros that apply a reply, status, priority, assignee, group and tag changes in one click, all or nothing
- Canned responses and macros are personal, or shared by an admin with everyone or one group
- Collision detection: the ticket page shows who else is viewing or typing, warns when the ticket changes after it was opened, and asks before posting a reply over someone else's change
- Time tracking with a reply or on its own, with the ticket total in the sidebar
- Every one of these changes is recorded in the ticket's history

### Phase 2a: Ticket core

- Tickets with a sequential number shown with an admin-set prefix (default `PTY-`), public replies, internal notes and attachments
- Statuses (open, on hold, resolved, closed types), priorities and two-level categories, seeded with sensible defaults and managed in admin; one default each, and anything still used by tickets can't be deleted
- Board layout for the ticket list: one column per status with counts, cards showing subject, number, requester, age, priority and assignee; drag a card or use its status menu to change status. The same filters and saved views apply, and a saved view remembers its layout
- Technician ticket list with search, filters (status, priority, category, assignee, group, type), sort, paging, built-in views (unresolved, mine, unassigned, all), personal and shared saved views, and bulk assign, move to group and close
- Ticket page with rich text replies and notes (Tiptap), optional status change in the same step, attachments, inline field edits and a history timeline that records every change with readable names
- Full-text search across subject, description and every message, kept current by database triggers, with prefix matching and lookup by ticket number
- All ticket HTML is sanitized before it is stored and again when it is shown; attachments are checked for size and executable types and always downloaded, never rendered in the browser
- Requesters only ever see their own tickets, never internal notes or their attachments, and never technician-only fields; enforced in `packages/core` queries and covered by tests
- New settings: `ATTACHMENT_MAX_MB`, `STORAGE_DIR`; attachments live on a new `uploads` Docker volume, which should be backed up with the database
- Windows checkouts keep LF line endings (`.gitattributes`)

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
