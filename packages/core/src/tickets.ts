import { getPrisma, type Prisma, type Tx } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import {
  discardStored,
  storeUploads,
  validateUploads,
  type StoredUpload,
  type UploadInput,
} from "./attachments";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { htmlToText, isBlankHtml, sanitizeHtml } from "./html";
import { can, type Actor, type Role } from "./permissions";
import { STATUS_TYPES, type StatusType } from "./ticket-config";
import { formatTicketNumber, getTicketSettings, parseTicketNumber } from "./ticket-settings";
import { parse } from "./validation";

export const TICKET_TYPES = ["incident", "request"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

// --- Schemas --------------------------------------------------------------------------

const uuid = z.uuid({ message: "invalid" });
/** "" from an empty <select> means "none". */
const optionalRef = z
  .union([uuid, z.literal("")])
  .transform((v) => v || null)
  .nullable()
  .optional();

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1, { message: "required" }).max(200),
  descriptionHtml: z.string().max(200_000).default(""),
  type: z.enum(TICKET_TYPES).optional(),
  priorityId: uuid.optional(),
  categoryId: optionalRef,
  requesterId: uuid.optional(),
  assigneeId: optionalRef,
  groupId: optionalRef,
});

export const updateTicketSchema = z.object({
  subject: z.string().trim().min(1, { message: "required" }).max(200).optional(),
  type: z.enum(TICKET_TYPES).optional(),
  statusId: uuid.optional(),
  priorityId: uuid.optional(),
  categoryId: optionalRef,
  requesterId: uuid.optional(),
  assigneeId: optionalRef,
  groupId: optionalRef,
  /** When the new status resolves or closes the ticket, also close its child tickets. */
  closeChildren: z.boolean().optional(),
});
export type TicketPatch = Omit<z.output<typeof updateTicketSchema>, "closeChildren">;

export const addMessageSchema = z.object({
  bodyHtml: z.string().max(200_000),
  isInternal: z.boolean(),
  statusId: uuid.optional(),
  /** Minutes worked, logged against this message. */
  minutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  /** The ticket's updatedAt when the author opened it, for the collision check. */
  seenUpdatedAt: z.coerce.date().optional(),
  /** Post even though the ticket changed since it was opened. */
  confirmStale: z.boolean().optional(),
});

export const bulkUpdateSchema = z
  .object({
    ids: z.array(uuid).min(1, { message: "required" }).max(200),
    assigneeId: optionalRef,
    groupId: optionalRef,
    statusId: uuid.optional(),
    /** Moves the tickets to the first closed status. */
    close: z.boolean().optional(),
  })
  .refine((b) => b.assigneeId !== undefined || b.groupId !== undefined || b.statusId || b.close, {
    message: "nothing_to_change",
    path: ["_form"],
  });

/** Comma-separated strings (from a URL) or arrays both become arrays. */
const listOf = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(item))
    .optional();

export const SORTS = ["updated", "created", "priority", "number", "subject"] as const;

export const ticketListQuerySchema = z.preprocess(
  // Empty URL parameters mean "not set".
  (v) =>
    v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined))
      : v,
  z.object({
    q: z.string().trim().max(200).optional(),
    status: listOf(uuid),
    statusType: listOf(z.enum(STATUS_TYPES)),
    priority: listOf(uuid),
    tag: listOf(uuid),
    category: uuid.optional(),
    assignee: z.union([z.literal("me"), z.literal("unassigned"), uuid]).optional(),
    group: z.union([z.literal("none"), uuid]).optional(),
    requester: uuid.optional(),
    type: z.enum(TICKET_TYPES).optional(),
    sort: z.enum(SORTS).default("updated"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
);
export type TicketListQuery = z.output<typeof ticketListQuerySchema>;

// --- Types returned to the web app -----------------------------------------------------

interface Named {
  id: string;
  name: string;
}

export interface TicketListItem {
  id: string;
  number: number;
  displayNumber: string;
  subject: string;
  type: TicketType;
  status: Named & { type: StatusType };
  priority: Named & { color: string; level: number };
  category: string | null;
  requester: Named;
  assignee: Named | null;
  group: Named | null;
  tags: (Named & { color: string })[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string | null;
  createdAt: Date;
}

export interface TicketMessageView {
  id: string;
  author: (Named & { role: Role }) | null;
  bodyHtml: string;
  bodyText: string;
  isInternal: boolean;
  createdAt: Date;
  attachments: TicketAttachment[];
}

export interface TicketHistoryEntry {
  id: string;
  action: string;
  actor: Named | null;
  diff: unknown;
  createdAt: Date;
}

export interface TicketDetail extends Omit<TicketListItem, "category"> {
  descriptionHtml: string;
  descriptionText: string;
  category: (Named & { parentName: string | null }) | null;
  requester: Named & { email: string };
  source: string;
  resolvedAt: Date | null;
  closedAt: Date | null;
  messages: TicketMessageView[];
  /** Every attachment the actor may see, including ones on the ticket itself. */
  attachments: TicketAttachment[];
  /** Field changes and other events. Empty for requesters. */
  history: TicketHistoryEntry[];
  /** Staff only below; requesters get empty lists and zero. */
  watchers: { id: string; email: string; user: Named | null }[];
  links: TicketLinkView[];
  timeEntries: TimeEntryView[];
  totalMinutes: number;
}

export type TicketLinkKind =
  "parent" | "child" | "related" | "duplicate" | "merged_into" | "merged_from";

export interface TicketLinkView {
  id: string;
  /** How the other ticket relates to this one, e.g. "parent" means it is this ticket's parent. */
  kind: TicketLinkKind;
  ticket: {
    id: string;
    displayNumber: string;
    subject: string;
    status: Named & { type: StatusType };
  };
}

export interface TimeEntryView {
  id: string;
  minutes: number;
  note: string;
  workedAt: Date;
  user: Named | null;
  messageId: string | null;
}

// --- Helpers --------------------------------------------------------------------------

export const isStaff = (actor: Actor) => can(actor, "ticket.viewAll");

export function requireWork(actor: Actor): void {
  if (!can(actor, "ticket.work")) throw new ForbiddenError();
}

/** Loads a ticket the actor may see, or throws NotFound so existence is never leaked. */
export async function findVisibleTicket(tx: Tx, actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) throw new NotFoundError();
  const ticket = await tx.ticket.findUnique({ where: { id }, include: { status: true } });
  if (!ticket || !can(actor, "ticket.viewOwn", { ownerId: ticket.requesterId }))
    throw new NotFoundError();
  return ticket;
}

export async function defaultStatus(tx: Tx) {
  const status = await tx.status.findFirst({ where: { isDefault: true } });
  if (!status) throw new ConflictError("no_default_status");
  return status;
}

export async function closedStatus(tx: Tx) {
  const status = await tx.status.findFirst({
    where: { type: "closed" },
    orderBy: { sortOrder: "asc" },
  });
  if (!status) throw new ConflictError("need_closed_status");
  return status;
}

/** Throws a field error unless the user exists, is active and (if required) is staff. */
async function checkUser(tx: Tx, id: string, field: string, staffOnly: boolean): Promise<Named> {
  const user = await tx.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw new ValidationError({ [field]: "user_not_found" });
  if (staffOnly && user.role === "requester")
    throw new ValidationError({ [field]: "assignee_not_staff" });
  return user;
}

export async function checkRef<T>(find: () => Promise<T | null>, field: string): Promise<T> {
  const row = await find();
  if (!row) throw new ValidationError({ [field]: "not_found" });
  return row;
}

/** resolved_at and closed_at follow the status type. */
function lifecycleStamps(
  type: StatusType,
  current: { resolvedAt: Date | null; closedAt: Date | null },
  now: Date,
): { resolvedAt: Date | null; closedAt: Date | null } {
  switch (type) {
    case "resolved":
      return { resolvedAt: current.resolvedAt ?? now, closedAt: null };
    case "closed":
      return { resolvedAt: current.resolvedAt ?? now, closedAt: current.closedAt ?? now };
    default:
      return { resolvedAt: null, closedAt: null };
  }
}

type DiffValue = string | null;
type TicketDiff = Record<string, { from: DiffValue; to: DiffValue }>;

/**
 * Applies a field patch inside a transaction and audits it with readable names, so history
 * still makes sense after a status or user is renamed. Returns false if nothing changed.
 */
export async function applyPatch(
  tx: Tx,
  actor: Actor,
  ticketId: string,
  patch: TicketPatch,
): Promise<boolean> {
  const t = await tx.ticket.findUnique({
    where: { id: ticketId },
    include: {
      status: true,
      priority: true,
      category: true,
      requester: true,
      assignee: true,
      group: true,
    },
  });
  if (!t) throw new NotFoundError();

  const diff: TicketDiff = {};
  const data: Prisma.TicketUncheckedUpdateInput = {};

  if (patch.subject !== undefined && patch.subject !== t.subject) {
    diff.subject = { from: t.subject, to: patch.subject };
    data.subject = patch.subject;
  }
  if (patch.type !== undefined && patch.type !== t.type) {
    diff.type = { from: t.type, to: patch.type };
    data.type = patch.type;
  }
  if (patch.statusId !== undefined && patch.statusId !== t.statusId) {
    const id = patch.statusId;
    const status = await checkRef(() => tx.status.findUnique({ where: { id } }), "statusId");
    diff.status = { from: t.status.name, to: status.name };
    data.statusId = status.id;
    Object.assign(data, lifecycleStamps(status.type, t, new Date()));
  }
  if (patch.priorityId !== undefined && patch.priorityId !== t.priorityId) {
    const id = patch.priorityId;
    const priority = await checkRef(() => tx.priority.findUnique({ where: { id } }), "priorityId");
    diff.priority = { from: t.priority.name, to: priority.name };
    data.priorityId = priority.id;
  }
  if (patch.categoryId !== undefined && patch.categoryId !== t.categoryId) {
    const id = patch.categoryId;
    const category = id
      ? await checkRef(() => tx.category.findUnique({ where: { id } }), "categoryId")
      : null;
    diff.category = { from: t.category?.name ?? null, to: category?.name ?? null };
    data.categoryId = category?.id ?? null;
  }
  if (patch.requesterId !== undefined && patch.requesterId !== t.requesterId) {
    const requester = await checkUser(tx, patch.requesterId, "requesterId", false);
    diff.requester = { from: t.requester.name, to: requester.name };
    data.requesterId = requester.id;
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== t.assigneeId) {
    const assignee = patch.assigneeId
      ? await checkUser(tx, patch.assigneeId, "assigneeId", true)
      : null;
    diff.assignee = { from: t.assignee?.name ?? null, to: assignee?.name ?? null };
    data.assigneeId = assignee?.id ?? null;
  }
  if (patch.groupId !== undefined && patch.groupId !== t.groupId) {
    const id = patch.groupId;
    const group = id
      ? await checkRef(() => tx.group.findUnique({ where: { id } }), "groupId")
      : null;
    diff.group = { from: t.group?.name ?? null, to: group?.name ?? null };
    data.groupId = group?.id ?? null;
  }

  if (Object.keys(diff).length === 0) return false;
  await tx.ticket.update({ where: { id: ticketId }, data });
  await writeAudit(tx, {
    entityType: "ticket",
    entityId: ticketId,
    actorId: actor.id,
    action: "updated",
    diff,
  });
  return true;
}

// --- Create -------------------------------------------------------------------------

export async function createTicket(
  actor: Actor,
  input: unknown,
): Promise<{ id: string; number: number }> {
  if (!can(actor, "ticket.create")) throw new ForbiddenError();
  const data = parse(createTicketSchema, input);
  const staff = isStaff(actor);
  // Requesters file tickets for themselves and cannot set fields technicians own.
  if (!staff && (data.requesterId || data.assigneeId || data.groupId || data.priorityId)) {
    throw new ForbiddenError();
  }
  const descriptionHtml = sanitizeHtml(data.descriptionHtml);

  return getPrisma().$transaction(async (tx) => {
    const status = await defaultStatus(tx);
    const priorityId = data.priorityId;
    const priority = priorityId
      ? await checkRef(() => tx.priority.findUnique({ where: { id: priorityId } }), "priorityId")
      : await checkRef(() => tx.priority.findFirst({ where: { isDefault: true } }), "priorityId");
    const categoryId = data.categoryId;
    const category = categoryId
      ? await checkRef(() => tx.category.findUnique({ where: { id: categoryId } }), "categoryId")
      : null;
    const requester = data.requesterId
      ? await checkUser(tx, data.requesterId, "requesterId", false)
      : null;
    const assignee = data.assigneeId
      ? await checkUser(tx, data.assigneeId, "assigneeId", true)
      : null;
    const groupId = data.groupId;
    const group = groupId
      ? await checkRef(() => tx.group.findUnique({ where: { id: groupId } }), "groupId")
      : null;

    const ticket = await tx.ticket.create({
      data: {
        subject: data.subject,
        descriptionHtml,
        descriptionText: htmlToText(descriptionHtml),
        type: data.type ?? "incident",
        statusId: status.id,
        priorityId: priority.id,
        categoryId: category?.id ?? null,
        requesterId: requester?.id ?? actor.id,
        assigneeId: assignee?.id ?? null,
        groupId: group?.id ?? null,
        source: staff ? "agent" : "portal",
      },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticket.id,
      actorId: actor.id,
      action: "created",
      diff: {
        subject: ticket.subject,
        status: status.name,
        priority: priority.name,
        category: category?.name ?? null,
        assignee: assignee?.name ?? null,
        group: group?.name ?? null,
      },
    });
    return { id: ticket.id, number: ticket.number };
  });
}

// --- Read --------------------------------------------------------------------------

const listInclude = {
  status: { select: { id: true, name: true, type: true } },
  priority: { select: { id: true, name: true, color: true, level: true } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  tags: {
    select: { tag: { select: { id: true, name: true, color: true } } },
    orderBy: { tag: { name: "asc" } },
  },
} as const;

export async function getTicket(actor: Actor, id: string): Promise<TicketDetail> {
  const prisma = getPrisma();
  const base = await findVisibleTicket(prisma, actor, id);
  const staff = isStaff(actor);

  const [t, history, extras, { prefix }] = await Promise.all([
    prisma.ticket.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        ...listInclude,
        category: { select: { id: true, name: true, parent: { select: { name: true } } } },
        messages: {
          where: staff ? {} : { isInternal: false },
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        attachments: {
          // Requesters never see files attached to internal notes.
          where: staff ? {} : { OR: [{ messageId: null }, { message: { isInternal: false } }] },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            messageId: true,
            createdAt: true,
          },
        },
      },
    }),
    staff
      ? prisma.auditLog.findMany({
          where: { entityType: "ticket", entityId: base.id },
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    staff ? loadStaffExtras(base.id) : Promise.resolve(null),
    getTicketSettings(),
  ]);

  return {
    id: t.id,
    number: t.number,
    displayNumber: formatTicketNumber(t.number, prefix),
    subject: t.subject,
    type: t.type,
    descriptionHtml: t.descriptionHtml,
    descriptionText: t.descriptionText,
    status: t.status,
    priority: t.priority,
    category: t.category
      ? { id: t.category.id, name: t.category.name, parentName: t.category.parent?.name ?? null }
      : null,
    requester: t.requester,
    assignee: staff ? t.assignee : null,
    group: staff ? t.group : null,
    tags: staff ? t.tags.map((x) => x.tag) : [],
    source: t.source,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    closedAt: t.closedAt,
    attachments: t.attachments,
    messages: t.messages.map((m) => ({
      id: m.id,
      author: m.author ? { ...m.author, role: m.author.role as Role } : null,
      bodyHtml: m.bodyHtml,
      bodyText: m.bodyText,
      isInternal: m.isInternal,
      createdAt: m.createdAt,
      attachments: t.attachments.filter((a) => a.messageId === m.id),
    })),
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      actor: h.actor,
      diff: h.diff,
      createdAt: h.createdAt,
    })),
    watchers: extras?.watchers ?? [],
    links: extras ? extras.links(prefix) : [],
    timeEntries: extras?.timeEntries ?? [],
    totalMinutes: extras?.timeEntries.reduce((sum, e) => sum + e.minutes, 0) ?? 0,
  };
}

/** Watchers, links and time entries: shown to technicians only. */
async function loadStaffExtras(ticketId: string) {
  const prisma = getPrisma();
  const other = {
    select: {
      id: true,
      number: true,
      subject: true,
      status: { select: { id: true, name: true, type: true } },
    },
  } as const;
  const [watchers, linksFrom, linksTo, timeEntries] = await Promise.all([
    prisma.ticketWatcher.findMany({
      where: { ticketId },
      orderBy: { email: "asc" },
      select: { id: true, email: true, user: { select: { id: true, name: true } } },
    }),
    prisma.ticketLink.findMany({ where: { fromTicketId: ticketId }, include: { to: other } }),
    prisma.ticketLink.findMany({ where: { toTicketId: ticketId }, include: { from: other } }),
    prisma.timeEntry.findMany({
      where: { ticketId },
      orderBy: { workedAt: "desc" },
      select: {
        id: true,
        minutes: true,
        note: true,
        workedAt: true,
        messageId: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);
  // A link stored as (from, to, type) reads differently from each end.
  const fromKind: Record<string, TicketLinkKind> = {
    parent: "child",
    related: "related",
    duplicate: "duplicate",
    merged_into: "merged_into",
  };
  const toKind: Record<string, TicketLinkKind> = {
    parent: "parent",
    related: "related",
    duplicate: "duplicate",
    merged_into: "merged_from",
  };
  type Other = {
    id: string;
    number: number;
    subject: string;
    status: Named & { type: StatusType };
  };
  const view = (id: string, kind: TicketLinkKind, o: Other, prefix: string): TicketLinkView => ({
    id,
    kind,
    ticket: {
      id: o.id,
      displayNumber: formatTicketNumber(o.number, prefix),
      subject: o.subject,
      status: o.status,
    },
  });
  return {
    watchers,
    timeEntries,
    links: (prefix: string) => [
      ...linksTo.map((l) => view(l.id, toKind[l.linkType] ?? "related", l.from, prefix)),
      ...linksFrom.map((l) => view(l.id, fromKind[l.linkType] ?? "related", l.to, prefix)),
    ],
  };
}

/** Builds a prefix-matching full-text query ("print serv" → print:* & serv:*), or null. */
function prefixTsQuery(q: string): string | null {
  const terms = q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 10) ?? [];
  return terms.length ? terms.map((t) => `${t}:*`).join(" & ") : null;
}

async function searchIds(q: string): Promise<{ ids: string[]; number: number | null }> {
  const number = parseTicketNumber(q);
  const query = prefixTsQuery(q);
  const ids = query
    ? (
        await getPrisma().$queryRaw<{ id: string }[]>`
          SELECT id FROM tickets WHERE search_vector @@ to_tsquery('english', ${query}) LIMIT 5000`
      ).map((r) => r.id)
    : [];
  return { ids, number };
}

type ListRow = Prisma.TicketGetPayload<{ include: typeof listInclude }>;

/** Turns a parsed list query into Prisma filters; shared by the list and the board. */
async function buildWhere(actor: Actor, q: TicketListQuery): Promise<Prisma.TicketWhereInput> {
  const where: Prisma.TicketWhereInput[] = [];
  if (q.q) {
    const { ids, number } = await searchIds(q.q);
    where.push({ OR: [{ id: { in: ids } }, ...(number !== null ? [{ number }] : [])] });
  }
  if (q.status?.length) where.push({ statusId: { in: q.status } });
  if (q.statusType?.length) where.push({ status: { type: { in: q.statusType } } });
  if (q.priority?.length) where.push({ priorityId: { in: q.priority } });
  if (q.tag?.length) where.push({ tags: { some: { tagId: { in: q.tag } } } });
  if (q.category)
    where.push({ OR: [{ categoryId: q.category }, { category: { parentId: q.category } }] });
  if (q.assignee === "me") where.push({ assigneeId: actor.id });
  else if (q.assignee === "unassigned") where.push({ assigneeId: null });
  else if (q.assignee) where.push({ assigneeId: q.assignee });
  if (q.group === "none") where.push({ groupId: null });
  else if (q.group) where.push({ groupId: q.group });
  if (q.requester) where.push({ requesterId: q.requester });
  if (q.type) where.push({ type: q.type });
  return { AND: where };
}

function buildOrderBy(q: TicketListQuery): Prisma.TicketOrderByWithRelationInput[] {
  return [
    q.sort === "priority"
      ? { priority: { level: q.dir } }
      : q.sort === "created"
        ? { createdAt: q.dir }
        : q.sort === "number"
          ? { number: q.dir }
          : q.sort === "subject"
            ? { subject: q.dir }
            : { updatedAt: q.dir },
    { number: "desc" },
  ];
}

function toListItem(t: ListRow, prefix: string): TicketListItem {
  return {
    id: t.id,
    number: t.number,
    displayNumber: formatTicketNumber(t.number, prefix),
    subject: t.subject,
    type: t.type,
    status: t.status,
    priority: t.priority,
    category: t.category
      ? t.category.parent
        ? `${t.category.parent.name} › ${t.category.name}`
        : t.category.name
      : null,
    requester: { id: t.requester.id, name: t.requester.name },
    assignee: t.assignee,
    group: t.group,
    tags: t.tags.map((x) => x.tag),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listTickets(
  actor: Actor,
  input: unknown,
): Promise<{ items: TicketListItem[]; total: number; page: number; pageSize: number }> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  const q = parse(ticketListQuerySchema, input);
  const filter = await buildWhere(actor, q);

  const prisma = getPrisma();
  const [rows, total, { prefix }] = await Promise.all([
    prisma.ticket.findMany({
      where: filter,
      orderBy: buildOrderBy(q),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: listInclude,
    }),
    prisma.ticket.count({ where: filter }),
    getTicketSettings(),
  ]);

  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((t) => toListItem(t, prefix)),
  };
}

export interface TicketBoardColumn {
  status: { id: string; name: string; type: StatusType };
  /** Every ticket in this status that matches the filters. */
  total: number;
  /** The first BOARD_COLUMN_LIMIT of them, in the query's sort order. */
  items: TicketListItem[];
}

export const BOARD_COLUMN_LIMIT = 50;

/**
 * The ticket list grouped into one column per status, in the admin's status order. Status
 * filters pick which columns appear; every other filter and the sort apply inside them.
 */
export async function getTicketBoard(actor: Actor, input: unknown): Promise<TicketBoardColumn[]> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  const q = parse(ticketListQuerySchema, input);
  const filter = await buildWhere(actor, q);

  const prisma = getPrisma();
  const statuses = await prisma.status.findMany({
    where: {
      ...(q.status?.length ? { id: { in: q.status } } : {}),
      ...(q.statusType?.length ? { type: { in: q.statusType } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });
  const [counts, { prefix }] = await Promise.all([
    prisma.ticket.groupBy({ by: ["statusId"], where: filter, _count: { _all: true } }),
    getTicketSettings(),
  ]);
  const totals = new Map(counts.map((c) => [c.statusId, c._count._all]));
  const orderBy = buildOrderBy(q);

  return Promise.all(
    statuses.map(async (status) => {
      const total = totals.get(status.id) ?? 0;
      const rows =
        total === 0
          ? []
          : await prisma.ticket.findMany({
              where: { AND: [filter, { statusId: status.id }] },
              orderBy,
              take: BOARD_COLUMN_LIMIT,
              include: listInclude,
            });
      return { status, total, items: rows.map((t) => toListItem(t, prefix)) };
    }),
  );
}

// --- Change -------------------------------------------------------------------------

export async function updateTicket(actor: Actor, id: string, input: unknown): Promise<void> {
  requireWork(actor);
  const { closeChildren, ...patch } = parse(updateTicketSchema, input);
  await getPrisma().$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, id);
    await applyPatch(tx, actor, id, patch);
    if (closeChildren) await closeChildTickets(tx, actor, id);
  });
}

/** Closes the open children of a ticket once it is resolved or closed. */
export async function closeChildTickets(tx: Tx, actor: Actor, parentId: string): Promise<number> {
  const parent = await tx.ticket.findUniqueOrThrow({
    where: { id: parentId },
    include: { status: true },
  });
  if (parent.status.type !== "resolved" && parent.status.type !== "closed") return 0;
  const closed = await closedStatus(tx);
  const children = await tx.ticketLink.findMany({
    where: {
      fromTicketId: parentId,
      linkType: "parent",
      to: { status: { type: { notIn: ["resolved", "closed"] } } },
    },
    select: { toTicketId: true },
  });
  for (const c of children) await applyPatch(tx, actor, c.toTicketId, { statusId: closed.id });
  return children.length;
}

/**
 * Inserts a message with already-stored attachments inside a transaction, touches the ticket
 * and audits it. Shared by replies, macros and merges.
 */
export async function insertMessage(
  tx: Tx,
  actor: Actor,
  ticketId: string,
  input: {
    bodyHtml: string;
    isInternal: boolean;
    stored: StoredUpload[];
    minutes?: number | undefined;
  },
): Promise<string> {
  const message = await tx.ticketMessage.create({
    data: {
      ticketId,
      authorId: actor.id,
      bodyHtml: input.bodyHtml,
      bodyText: htmlToText(input.bodyHtml),
      isInternal: input.isInternal,
      source: isStaff(actor) ? "agent" : "portal",
      attachments: {
        create: input.stored.map((s) => ({ ...s, ticketId, uploadedById: actor.id })),
      },
    },
  });
  await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  await writeAudit(tx, {
    entityType: "ticket",
    entityId: ticketId,
    actorId: actor.id,
    action: input.isInternal ? "noted" : "replied",
    diff: { messageId: message.id, attachments: input.stored.map((s) => s.filename) },
  });
  if (input.minutes) {
    await tx.timeEntry.create({
      data: {
        ticketId,
        userId: actor.id,
        minutes: input.minutes,
        workedAt: new Date(),
        messageId: message.id,
      },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticketId,
      actorId: actor.id,
      action: "time_logged",
      diff: { minutes: input.minutes },
    });
  }
  return message.id;
}

/** Adds a public reply or an internal note, with optional attachments and status change. */
export async function addMessage(
  actor: Actor,
  ticketId: string,
  input: {
    bodyHtml: string;
    isInternal: boolean;
    statusId?: string | undefined;
    files?: UploadInput[] | undefined;
    minutes?: number | string | undefined;
    seenUpdatedAt?: Date | string | undefined;
    confirmStale?: boolean | undefined;
  },
): Promise<string> {
  const { files = [], ...rest } = input;
  const data = parse(addMessageSchema, rest);
  const prisma = getPrisma();
  const ticket = await findVisibleTicket(prisma, actor, ticketId);

  if (data.isInternal && !can(actor, "ticket.addInternalNote")) throw new ForbiddenError();
  if (data.statusId && !can(actor, "ticket.work")) throw new ForbiddenError();
  if (data.minutes && !can(actor, "ticket.logTime")) throw new ForbiddenError();
  // Collision check: someone else changed the ticket after the author opened it.
  if (data.seenUpdatedAt && !data.confirmStale && ticket.updatedAt > data.seenUpdatedAt) {
    throw new ConflictError("ticket_changed");
  }
  if (!isStaff(actor) && !can(actor, "ticket.replyOwn", { ownerId: ticket.requesterId }))
    throw new ForbiddenError();

  const bodyHtml = sanitizeHtml(data.bodyHtml);
  if (isBlankHtml(bodyHtml) && files.length === 0)
    throw new ValidationError({ bodyHtml: "required" });
  validateUploads(files);

  const stored = await storeUploads(files);
  try {
    return await prisma.$transaction(async (tx) => {
      const messageId = await insertMessage(tx, actor, ticketId, {
        bodyHtml,
        isInternal: data.isInternal,
        stored,
        minutes: data.minutes,
      });
      if (data.statusId) await applyPatch(tx, actor, ticketId, { statusId: data.statusId });
      return messageId;
    });
  } catch (err) {
    await discardStored(stored);
    throw err;
  }
}

export async function bulkUpdateTickets(
  actor: Actor,
  input: unknown,
): Promise<{ updated: number }> {
  requireWork(actor);
  const data = parse(bulkUpdateSchema, input);
  return getPrisma().$transaction(async (tx) => {
    const statusId = data.close ? (await closedStatus(tx)).id : data.statusId;
    const patch: TicketPatch = {
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
      ...(data.groupId !== undefined ? { groupId: data.groupId } : {}),
      ...(statusId ? { statusId } : {}),
    };
    let updated = 0;
    for (const id of new Set(data.ids)) {
      await findVisibleTicket(tx, actor, id);
      if (await applyPatch(tx, actor, id, patch)) updated++;
    }
    return { updated };
  });
}

// --- Pickers ------------------------------------------------------------------------

/** Active technicians and admins, for assignee pickers. */
export async function listAssignees(actor: Actor): Promise<Named[]> {
  if (!can(actor, "ticket.work")) throw new ForbiddenError();
  return getPrisma().user.findMany({
    where: { isActive: true, role: { in: ["technician", "admin"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Active users of any role, for the requester picker. */
export async function listRequesterOptions(actor: Actor): Promise<(Named & { email: string })[]> {
  if (!can(actor, "ticket.work")) throw new ForbiddenError();
  return getPrisma().user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
    take: 2000,
  });
}

/** Groups, for the group picker and list filter. */
export async function listGroupOptions(actor: Actor): Promise<Named[]> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  return getPrisma().group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
