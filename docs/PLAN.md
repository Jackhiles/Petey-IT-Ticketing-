# Petey build plan

Oct 7, 2026 · @Jack

Petey is an open-source, self-hosted IT service desk modeled on ManageEngine ServiceDesk Plus. This plan is the brief for Claude Code: build it in the phase order below, one phase per working session, and do not start a phase until the previous one meets its acceptance criteria.

## Scope

Petey v1 is an ITIL-style help desk for a small IT team: requesters raise tickets by email or a self-service portal, technicians work them against SLAs, and admins configure the rules. It ships as one `docker compose up`.

**In v1 (the ServiceDesk Plus features worth copying first):**

- Incident and service request tickets with status, priority, category, assignment, internal notes and public replies
- Tags, watchers and CC on tickets
- Merge, split and link tickets (parent/child, related, duplicate)
- Canned responses and one-click macros for technicians
- Collision detection: see who else is viewing or replying to a ticket
- Time tracking per ticket
- Self-service portal for requesters: submit, track, reply, close
- Email-to-ticket (IMAP in) and notifications (SMTP out), with replies threaded onto the ticket
- Satisfaction survey sent when a ticket is resolved
- SLA policies with response and resolution targets, business hours, and escalation
- Automation rules: on create or update, match conditions, run actions (assign, set field, notify)
- Knowledge base with public and technician-only articles, suggested on ticket submit
- Asset inventory (hardware and software) linked to users and tickets, and data import from CSV files and from ServiceDesk Plus (users, tickets with history, assets, knowledge base)
- Reports: a built-in dashboard (open by status, SLA compliance, technician workload, volume over time) plus a report builder where technicians create, save, share, schedule and export their own reports
- REST API with token auth, covering everything the UI does
- Two-factor sign-in (TOTP) for technicians and admins
- Audit log of every ticket change

**After v1, in this order:** problem management, change management with approvals, service catalog with custom request forms, LDAP/AD and OIDC sign-in, CMDB relationships, purchase and contract tracking, multi-site support.

**Out of scope:** multi-tenant SaaS hosting, remote control, network discovery agents, native mobile apps, billing. The web UI must be responsive instead.

## Stack and decisions

These choices are fixed unless Jack changes them. They favor one language end to end and the fewest containers a homelab has to run.

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | One language for UI, API and worker |
| Web framework | Next.js (App Router) | UI and API routes in one deployable |
| Database | PostgreSQL 16 | Relational data, full-text search, JSONB for custom fields |
| ORM | Prisma | Typed queries, migrations in the repo |
| Background jobs | pg-boss | Queue lives in Postgres, so no Redis container |
| Auth | Auth.js, email and password first | LDAP and OIDC providers slot in later |
| UI | Tailwind CSS and shadcn/ui | Accessible components, dark mode from day one |
| Validation | Zod | Same schemas for forms, API and automation rules |
| Email | imapflow (in), nodemailer (out), mailparser | Works with any mailbox |
| Search | Postgres full-text (`tsvector`) | No extra search service |
| File storage | Local volume, behind a storage interface | S3-compatible backend can be added later |
| Tests | Vitest (unit and integration), Playwright (end to end) |  |
| Deploy | Docker Compose: `web`, `worker`, `db` | Single command install |
| CI | GitHub Actions: lint, typecheck, test, build image |  |
| License | AGPL-3.0 | Keeps hosted forks open; see Open questions |

## Architecture

Petey is one codebase that runs as two processes against one database. All business logic lives in a framework-free core package, so the UI, the REST API, the email poller and automation all call the same functions.

**Processes**

- `web`: Next.js server. Serves the technician app, the requester portal, the admin area and `/api/v1`.
- `worker`: Node process running pg-boss jobs: IMAP polling, outbound email, SLA timers, automation actions, report rollups.
- `db`: PostgreSQL. Holds application data, the job queue and the search index.

**Repo layout (pnpm workspace)**

```
petey/
  apps/
    web/          Next.js app: (portal), (agent), (admin) route groups, api/v1
    worker/       pg-boss job handlers
  packages/
    core/         domain services: tickets, sla, automation, kb, assets, auth
    db/           Prisma schema, migrations, seed
    email/        IMAP ingest, parsing, threading, SMTP send, templates
    ui/           shared components
  docker/         Dockerfile, compose.yml, .env.example
  docs/           install, configuration, API reference, architecture notes
```

**Rules that keep it maintainable**

- Route handlers and server actions stay thin: parse with Zod, check permission, call a `core` service, return.
- Every state change goes through a `core` service that writes the change and its audit row in one transaction.
- Services emit domain events (`ticket.created`, `ticket.updated`, `reply.added`) to pg-boss. Automation, notifications and SLA recalculation subscribe to events and never run inline in a request.
- The API is versioned at `/api/v1` and described by an OpenAPI file generated from the Zod schemas.

**Life of a ticket**

1. A requester emails the support mailbox or submits the portal form.
2. The worker's IMAP poll, or the portal action, calls `tickets.create`. Email replies are matched to an existing ticket by `In-Reply-To` header, then by a `[PTY-1234]` subject tag.
3. `ticket.created` fires. Automation rules run in order and may set category, priority and assignee.
4. The SLA service picks the matching policy and schedules response and resolution deadline jobs, counted in business hours.
5. Notifications go out to the requester and the assigned technician or group.
6. Technician replies and status changes repeat steps 3 to 5 through `ticket.updated`. Status types that pause the SLA clock (for example, waiting on requester) stop the timers.
7. On resolve, the requester gets a confirmation. The ticket auto-closes after a configurable number of days without a reply.

## Data model

The core is about 30 tables. Every table has `id` (UUID), `created_at` and `updated_at`; tickets also get a human-readable sequential number shown as `PTY-1234`.

| Table | Key fields | Notes |
| --- | --- | --- |
| `users` | email, name, role, password\_hash, department\_id, is\_active | One table for requesters, technicians and admins |
| `groups` | name, description | Technician support groups; `group_members` joins to users |
| `departments` | name | Requester org unit |
| `tickets` | number, type, subject, description, status\_id, priority\_id, category\_id, requester\_id, assignee\_id, group\_id, source, sla\_policy\_id, first\_response\_due, resolution\_due, first\_responded\_at, resolved\_at, closed\_at, custom\_fields (JSONB), search\_vector | type is `incident` or `request` |
| `ticket_messages` | ticket\_id, author\_id, body\_html, body\_text, is\_internal, source, email\_message\_id | Public replies and internal notes |
| `attachments` | ticket\_id, message\_id, filename, mime\_type, size, storage\_key |  |
| `statuses` | name, type, pauses\_sla, sort\_order | type is `open`, `on_hold`, `resolved` or `closed` |
| `priorities` | name, level, color |  |
| `categories` | name, parent\_id | Two levels: category and subcategory |
| `custom_field_defs` | key, label, field\_type, options, applies\_to, required | Values live in `tickets.custom_fields` |
| `business_hours` | name, timezone, weekly\_schedule (JSONB) | `holidays` table hangs off this |
| `sla_policies` | name, conditions (JSONB), response\_minutes, resolution\_minutes, business\_hours\_id, sort\_order | First matching policy wins |
| `sla_escalations` | policy\_id, target, offset\_minutes, action (JSONB) | Fires before or after a deadline |
| `automation_rules` | name, trigger, conditions (JSONB), actions (JSONB), sort\_order, is\_enabled |  |
| `kb_categories` | name, parent\_id, visibility |  |
| `kb_articles` | title, slug, body, category\_id, visibility, status, author\_id, search\_vector | visibility is `public` or `internal` |
| `assets` | tag, name, asset\_type\_id, state, serial, assigned\_user\_id, location, purchase\_date, warranty\_end, attributes (JSONB) | `ticket_assets` joins to tickets |
| `asset_types` | name, kind, attribute\_schema (JSONB) | kind is `hardware` or `software` |
| `mailboxes` | address, imap and smtp settings (encrypted), default\_group\_id, last\_uid |  |
| `notification_templates` | event, audience, subject, body | Editable in admin, with variables |
| `api_tokens` | user\_id, name, token\_hash, last\_used\_at, expires\_at |  |
| `audit_log` | entity\_type, entity\_id, actor\_id, action, diff (JSONB) | Append-only |
| saved\_reports | name, description, owner\_id, dataset, spec (JSONB), chart\_type, visibility, shared\_group\_id | visibility is private, group or all technicians; spec holds columns, filters, grouping and aggregates |
| report\_schedules | report\_id, cron, timezone, recipients, format, last\_run\_at, is\_enabled | Worker emails the report on schedule |
| tags | name, color | ticket\_tags joins to tickets |
| ticket\_watchers | ticket\_id, user\_id, email | A user, or a bare CC address; watchers get public updates only unless they are technicians |
| ticket\_links | from\_ticket\_id, to\_ticket\_id, link\_type | link\_type is parent, related, duplicate or merged\_into |
| canned\_responses | title, body, owner\_id, visibility, shared\_group\_id | Body supports the same variables as notification templates |
| macros | name, actions (JSONB), owner\_id, visibility, shared\_group\_id | Reuses the automation action shape, run by hand on one ticket |
| time\_entries | ticket\_id, user\_id, minutes, note, worked\_at, message\_id | Optional link to the reply it was logged with |
| satisfaction\_ratings | ticket\_id, score, comment, token\_hash, submitted\_at | One per ticket; latest rating wins |
| user\_totp | user\_id, secret (encrypted), confirmed\_at, recovery\_code\_hashes | Two-factor enrollment |
| import\_runs | source, mode, status, started\_by, started\_at, finished\_at, counts (JSONB), mapping (JSONB), error\_log | mode is dry\_run or live; mapping holds the status, priority, category and field choices |
| import\_refs | source, entity\_type, external\_id, petey\_id, import\_run\_id | Unique on source, entity\_type and external\_id, so a re-run updates instead of duplicating |

Conditions for SLA policies and automation rules share one JSON shape and one evaluator in `core`: a list of `{field, operator, value}` joined by `all` or `any`.

## Roles and permissions

v1 has three fixed roles. Permission checks go through one `can(user, action, resource)` function in `core`, so custom roles can be added later without touching call sites.

| Capability | Requester | Technician | Admin |
| --- | --- | --- | --- |
| Create tickets, view and reply to own tickets | Yes | Yes | Yes |
| Read public knowledge base | Yes | Yes | Yes |
| View and work all tickets, add internal notes | No | Yes | Yes |
| Read internal articles, write and publish articles | No | Yes | Yes |
| View and edit assets | No | Yes | Yes |
| View the dashboard; build, save, share, schedule and export reports | No | Yes | Yes |
| Create personal API tokens | No | Yes | Yes |
| Manage users, groups, categories, statuses, custom fields | No | No | Yes |
| Manage SLA policies, automation rules, mailboxes, templates | No | No | Yes |
| Read the audit log | No | No | Yes |
| Rate a resolved ticket | Yes | Yes | Yes |
| Merge, split and link tickets; log time; use and create personal canned responses and macros | No | Yes | Yes |
| Manage shared canned responses and macros, tags, survey settings, and the two-factor requirement | No | No | Yes |
| Run data imports from CSV or another service desk | No | No | Yes |

Requesters never see internal notes, other requesters' tickets, or technician-only fields. Enforce this in `core` queries, not only in the UI, and cover it with tests.

## Build phases

Twelve phases take Petey from an empty repo to a tagged v1.0. Each phase ends with passing CI, updated docs and a short entry in `CHANGELOG.md`.

### Phase 0: Foundation

- pnpm workspace, TypeScript strict, ESLint, Prettier, Vitest, Playwright
- Prisma connected to Postgres; `docker/compose.yml` with `web`, `worker`, `db`
- GitHub Actions: lint, typecheck, test, build
- `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CLAUDE.md`, `.env.example`

Done when: `docker compose up` serves a health page, and CI is green on an empty test suite.

### Phase 1: Users and auth

- `users`, `groups`, `departments` schema and seed data
- Email and password sign-in, sessions, password reset, first-run admin setup screen
- Two-factor sign-in with TOTP for technicians and admins: enrollment by QR code, recovery codes, admin reset, and an admin setting to require it
- `can()` permission function and route guards for the portal, agent and admin areas
- Admin screens for users and groups

Done when: each role can sign in and reaches only its own area, and a technician can enroll in two-factor and sign in with a code or a recovery code, verified by Playwright.

### Phase 2: Ticket core

- Tickets, messages, attachments, statuses, priorities, categories, audit log
- Technician views: list with filters, saved views, sort, bulk assign and close; ticket detail with reply, internal note, field edits and history
- Full-text search across subject, description and messages
- Admin screens for statuses, priorities and categories

Technician productivity features, built as a second pull request in this phase once the core above is merged:

- Tags on tickets, filterable in the list; watchers who receive updates without owning the ticket
- Merge duplicates into one ticket, keeping every message, attachment and watcher, with the source closed and linked as `merged_into`; split a message out into a new ticket; link tickets as parent/child or related, and close children when the parent resolves (optional per action)
- Canned responses with variables, searchable from the reply box; macros that apply several actions in one click, such as reply, set status and assign to me
- Collision detection: the ticket page shows who else is viewing or typing a reply, using a short-lived presence heartbeat over Server-Sent Events or polling, and warns before posting if the ticket changed since it was opened
- Time tracking: log minutes with a reply or on its own; ticket total shown in the sidebar

Done when: a technician can take a ticket from new to closed, and every change appears in its history; two duplicates merge without losing a message; a macro applies its actions in one click; and a second technician opening the same ticket sees the first one's presence.

### Phase 3: Requester portal

- Submit form with category, attachments and required-field validation
- My tickets list, ticket detail, reply, mark resolved, reopen
- Responsive layout checked at phone width

Done when: a requester can raise and follow a ticket without seeing internal notes or anyone else's tickets, verified by tests at the service and UI level.

### Phase 4: Email

- Mailbox settings in admin, credentials encrypted at rest
- Worker job polls IMAP, creates tickets, threads replies, saves attachments, ignores auto-replies and loops
- CC addresses on inbound email become watchers; watchers are copied on public replies
- Outbound notifications through SMTP with editable templates and variables
- Unknown senders create a requester account automatically (admin toggle)
- Satisfaction survey: the resolution email carries one-click rating links signed with a single-ticket token, so no sign-in is needed; an optional comment page follows; the rating shows on the ticket and can be turned off in admin

Done when: an email creates a ticket, a technician reply reaches the sender, the sender's reply lands on the same ticket, and clicking a rating in the resolution email records it on the ticket. Test against a local mail server container such as GreenMail or Mailpit.

### Phase 5: SLA

- Business hours and holidays; SLA policies with conditions; escalations
- Deadline calculation in business hours, pause on hold statuses, recalculation when priority changes
- Due and breached indicators on the ticket list and detail

Done when: unit tests cover deadline math across weekends, holidays, pauses and time zones, and a breached ticket triggers its escalation.

### Phase 6: Automation rules

- Shared condition evaluator; triggers on create, update and time-based
- Actions: set field, assign to user or group, round-robin within a group, add note, send notification
- Admin rule builder with ordering, enable toggle and a dry-run against a sample ticket

Done when: a rule such as "category is Network, assign to Network group, priority High" fires on a new email ticket, and loops between rules are prevented.

### Phase 7: Knowledge base

- Categories, articles with a rich text editor, draft and published states, public and internal visibility
- Portal search and browse; article suggestions while a requester types a subject
- Insert article link into a ticket reply; convert a resolved ticket into a draft article

Done when: a published public article appears in portal search and in submit-time suggestions, and internal articles stay hidden from requesters.

### Phase 8: Assets

- Asset types with custom attributes, assets, assignment to users, state changes with history
- Link assets to tickets; show a user's assets on their tickets
- CSV import and export

Done when: an imported CSV of 500 assets is searchable, and a ticket shows its linked asset with a path back to that asset's ticket history.

### Phase 9: Reports

- Dashboard: open tickets by status and priority, created versus resolved over time, SLA compliance, workload per technician
- Report builder for technicians: pick a dataset (tickets, SLA results, assets, technician activity, time entries, satisfaction ratings), choose columns, add filters, group by up to two fields, and apply aggregates (count, average, sum, min, max) over measures such as first response time and resolution time
- Custom fields are available as columns, filters and groupings
- Output as a table, bar, line or pie chart, with a relative or fixed date range
- Save reports as private, shared with a group, or visible to all technicians; duplicate and edit saved reports
- Export to CSV and PDF; schedule a saved report to be emailed daily, weekly or monthly
- A starter set of saved reports seeded on install, each editable

A report is stored as a JSON spec validated by Zod and compiled to a parameterized query over an allowlist of datasets and fields. Users never write SQL. Filters reuse the shared condition shape from automation and SLA. Queries run with a row limit and a statement timeout.

Done when: a technician builds "tickets resolved in the last 30 days, grouped by technician and category, with average resolution time", saves it, shares it with a group and schedules it weekly; the email arrives with the CSV; a requester cannot reach any report; and a spec naming a field outside the allowlist is rejected.

### Phase 10: Import and migration

Imports live in a new `packages/import` package. Each source is an adapter that reads the other system and emits one neutral format; a single loader writes that format into Petey through `core` services.

- Neutral import format, Zod-validated: users, groups, departments, categories, tickets with messages, attachments and time entries, assets with types, and knowledge base articles
- Generic CSV adapter for users, tickets and assets, with a column-mapping screen and a downloadable template for each
- ServiceDesk Plus adapter that pulls requests, conversations and notes, attachments, requesters and technicians, assets and solutions through its REST API. Before writing it, read the current API documentation for both the cloud and on-premises editions and record the endpoints, auth method, paging and rate limits in `docs/import-servicedesk-plus.md`. Fall back to its CSV or XLS exports for anything the API does not expose
- Admin import wizard: connect or upload, map the source's statuses, priorities, categories and custom fields to Petey's, run a dry run that reports counts and problems, then run live
- Loader rules: match users by email; keep original created, resolved and closed timestamps; keep the old ticket number as a searchable reference; preserve internal versus public on messages; write an `import_refs` row for every record
- Imports never send notifications, run automation rules or start SLA timers. Imported closed tickets stay closed
- Runs are resumable and idempotent: a failed or repeated run picks up where it stopped and updates existing records instead of duplicating them
- The adapter interface is documented so the community can add osTicket, Zammad, GLPI and others later

Test source: Jack will sign up for a ServiceDesk Plus free trial when this phase starts, not earlier, because the trial is time-limited. The first task of the phase is to seed the trial with sample users, tickets with replies and attachments, assets and solutions, then record its API responses as fixtures committed under `packages/import/fixtures` with credentials and real personal data removed. Automated tests run against the fixtures, so they keep passing after the trial ends.

Done when: a dry run against the ServiceDesk Plus free-trial instance reports accurate counts; the live run brings over users, tickets with full conversation history and attachments, assets and articles; running it a second time creates no duplicates; and no email leaves the system during either run.

### Phase 11: API and release

- `/api/v1` for tickets, messages, users, assets, articles and saved reports; token auth, pagination, rate limiting, OpenAPI document
- Outbound webhooks on ticket events
- Hardening: security headers, CSRF, upload type and size limits, HTML sanitization of email bodies, backup and restore instructions
- Install and upgrade docs, demo seed data, screenshots, tagged `v1.0.0` image

Done when: a fresh machine goes from clone to working install by following `docs/install.md` alone, and the API can do everything in phases 2 to 9.

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

## Open questions

None of these block Phase 0 except the license. Each has a default that Claude Code should use if Jack has not answered.

- [ ] **License:** AGPL-3.0 (default) or MIT? AGPL stops closed hosted forks; MIT is simpler for companies to adopt. Changing later is hard once outside contributors exist.
- [ ] **Stack:** TypeScript and Next.js (default), or a stack Jack would rather learn and maintain, such as Python and Django?
- [ ] **Ticket prefix:** `PTY-` (default) or something else, and should admins be able to change it?
- [ ] **Sign-in for v1:** local accounts only (default), or is LDAP/AD needed before first real use?
- [ ] **Requester accounts:** auto-create from inbound email (default on), or restrict to known users and domains?
- [ ] **Hosting of the project:** GitHub repo name and whether to publish images to GHCR (default: `petey`, yes).
- [ ] **Name check:** confirm no existing help desk product or trademark uses "Petey" before the first public release.
