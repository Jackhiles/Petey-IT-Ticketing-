// Statuses, priorities and categories: read by everyone who files or works tickets,
// managed by admins. Every change is audited.
import { getPrisma, type Tx } from "@petey/db";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { can, type Action, type Actor } from "./permissions";
import { parse } from "./validation";

export const STATUS_TYPES = ["open", "on_hold", "resolved", "closed"] as const;
export type StatusType = (typeof STATUS_TYPES)[number];

export interface StatusOption {
  id: string;
  name: string;
  type: StatusType;
  pausesSla: boolean;
  sortOrder: number;
  isDefault: boolean;
}
export interface PriorityOption {
  id: string;
  name: string;
  level: number;
  color: string;
  isDefault: boolean;
}
export interface CategoryOption {
  id: string;
  name: string;
  sortOrder: number;
  children: { id: string; name: string; sortOrder: number }[];
}

const name = z.string().trim().min(1, { message: "required" }).max(100);
const sortOrder = z.coerce.number().int().min(0).max(100_000).default(0);

export const statusSchema = z.object({
  name,
  type: z.enum(STATUS_TYPES),
  pausesSla: z.boolean().default(false),
  sortOrder,
  isDefault: z.boolean().default(false),
});

export const prioritySchema = z.object({
  name,
  level: z.coerce.number().int().min(0).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "invalid_color" }),
  isDefault: z.boolean().default(false),
});

export const categorySchema = z.object({
  name,
  parentId: z
    .union([z.uuid(), z.literal("")])
    .transform((v) => v || null)
    .nullable()
    .default(null),
  sortOrder,
});

function requirePermission(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

async function rethrowUnique<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("name_taken", { name: "name_taken" });
    throw err;
  }
}

// --- Reading ----------------------------------------------------------------

export async function listStatuses(): Promise<StatusOption[]> {
  const rows = await getPrisma().status.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(({ id, name, type, pausesSla, sortOrder, isDefault }) => ({
    id,
    name,
    type,
    pausesSla,
    sortOrder,
    isDefault,
  }));
}

export async function listPriorities(): Promise<PriorityOption[]> {
  return getPrisma().priority.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
    select: { id: true, name: true, level: true, color: true, isDefault: true },
  });
}

export async function listCategories(): Promise<CategoryOption[]> {
  return getPrisma().category.findMany({
    where: { parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, sortOrder: true },
      },
    },
  });
}

/** Ticket counts per status, priority or category, so admin screens can explain blocked deletes. */
export async function ticketUsage(): Promise<{
  statuses: Record<string, number>;
  priorities: Record<string, number>;
  categories: Record<string, number>;
}> {
  const prisma = getPrisma();
  const [s, p, c] = await Promise.all([
    prisma.ticket.groupBy({ by: ["statusId"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priorityId"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["categoryId"], _count: { _all: true } }),
  ]);
  return {
    statuses: Object.fromEntries(s.map((r) => [r.statusId, r._count._all])),
    priorities: Object.fromEntries(p.map((r) => [r.priorityId, r._count._all])),
    categories: Object.fromEntries(
      c.filter((r) => r.categoryId).map((r) => [r.categoryId as string, r._count._all]),
    ),
  };
}

// --- Statuses -----------------------------------------------------------------

async function checkStatusInvariants(tx: Tx): Promise<void> {
  const statuses = await tx.status.findMany();
  const defaults = statuses.filter((s) => s.isDefault);
  if (defaults.length !== 1)
    throw new ConflictError("need_one_default", { isDefault: "need_one_default" });
  if (defaults[0]?.type !== "open")
    throw new ConflictError("default_must_be_open", { isDefault: "default_must_be_open" });
  if (!statuses.some((s) => s.type === "closed"))
    throw new ConflictError("need_closed_status", { type: "need_closed_status" });
}

export async function createStatus(actor: Actor, input: unknown): Promise<string> {
  requirePermission(actor, "admin.statuses");
  const data = parse(statusSchema, input);
  return rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      if (data.isDefault) await tx.status.updateMany({ data: { isDefault: false } });
      const status = await tx.status.create({ data });
      await checkStatusInvariants(tx);
      await writeAudit(tx, {
        entityType: "status",
        entityId: status.id,
        actorId: actor.id,
        action: "created",
        diff: data,
      });
      return status.id;
    }),
  );
}

export async function updateStatus(actor: Actor, id: string, input: unknown): Promise<void> {
  requirePermission(actor, "admin.statuses");
  const data = parse(statusSchema, input);
  await rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      const before = await tx.status.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;
      if (data.isDefault)
        await tx.status.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      await tx.status.update({ where: { id }, data });
      await checkStatusInvariants(tx);
      await writeAudit(tx, {
        entityType: "status",
        entityId: id,
        actorId: actor.id,
        action: "updated",
        diff,
      });
    }),
  );
}

export async function deleteStatus(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, "admin.statuses");
  await getPrisma().$transaction(async (tx) => {
    const status = await tx.status.findUnique({ where: { id } });
    if (!status) throw new NotFoundError();
    if ((await tx.ticket.count({ where: { statusId: id } })) > 0) throw new ConflictError("in_use");
    await tx.status.delete({ where: { id } });
    await checkStatusInvariants(tx);
    await writeAudit(tx, {
      entityType: "status",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: status.name },
    });
  });
}

// --- Priorities ----------------------------------------------------------------

async function checkPriorityInvariants(tx: Tx): Promise<void> {
  if ((await tx.priority.count({ where: { isDefault: true } })) !== 1) {
    throw new ConflictError("need_one_default", { isDefault: "need_one_default" });
  }
}

export async function createPriority(actor: Actor, input: unknown): Promise<string> {
  requirePermission(actor, "admin.priorities");
  const data = parse(prioritySchema, input);
  return rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      if (data.isDefault) await tx.priority.updateMany({ data: { isDefault: false } });
      const priority = await tx.priority.create({ data });
      await checkPriorityInvariants(tx);
      await writeAudit(tx, {
        entityType: "priority",
        entityId: priority.id,
        actorId: actor.id,
        action: "created",
        diff: data,
      });
      return priority.id;
    }),
  );
}

export async function updatePriority(actor: Actor, id: string, input: unknown): Promise<void> {
  requirePermission(actor, "admin.priorities");
  const data = parse(prioritySchema, input);
  await rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      const before = await tx.priority.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;
      if (data.isDefault)
        await tx.priority.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      await tx.priority.update({ where: { id }, data });
      await checkPriorityInvariants(tx);
      await writeAudit(tx, {
        entityType: "priority",
        entityId: id,
        actorId: actor.id,
        action: "updated",
        diff,
      });
    }),
  );
}

export async function deletePriority(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, "admin.priorities");
  await getPrisma().$transaction(async (tx) => {
    const priority = await tx.priority.findUnique({ where: { id } });
    if (!priority) throw new NotFoundError();
    if ((await tx.ticket.count({ where: { priorityId: id } })) > 0)
      throw new ConflictError("in_use");
    await tx.priority.delete({ where: { id } });
    await checkPriorityInvariants(tx);
    await writeAudit(tx, {
      entityType: "priority",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: priority.name },
    });
  });
}

// --- Categories -----------------------------------------------------------------

async function checkCategory(
  tx: Tx,
  data: z.output<typeof categorySchema>,
  id: string | null,
): Promise<void> {
  if (data.parentId) {
    if (data.parentId === id)
      throw new ConflictError("invalid_parent", { parentId: "invalid_parent" });
    const parent = await tx.category.findUnique({ where: { id: data.parentId } });
    if (!parent) throw new NotFoundError();
    // Two levels only: a subcategory's parent must be top-level, and a category with
    // subcategories cannot itself become one.
    if (parent.parentId) throw new ConflictError("too_deep", { parentId: "too_deep" });
    if (id && (await tx.category.count({ where: { parentId: id } })) > 0) {
      throw new ConflictError("has_children", { parentId: "has_children" });
    }
  } else {
    const clash = await tx.category.findFirst({
      where: {
        parentId: null,
        name: { equals: data.name, mode: "insensitive" },
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (clash) throw new ConflictError("name_taken", { name: "name_taken" });
  }
}

export async function createCategory(actor: Actor, input: unknown): Promise<string> {
  requirePermission(actor, "admin.categories");
  const data = parse(categorySchema, input);
  return rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      await checkCategory(tx, data, null);
      const category = await tx.category.create({ data });
      await writeAudit(tx, {
        entityType: "category",
        entityId: category.id,
        actorId: actor.id,
        action: "created",
        diff: data,
      });
      return category.id;
    }),
  );
}

export async function updateCategory(actor: Actor, id: string, input: unknown): Promise<void> {
  requirePermission(actor, "admin.categories");
  const data = parse(categorySchema, input);
  await rethrowUnique(() =>
    getPrisma().$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;
      await checkCategory(tx, data, id);
      await tx.category.update({ where: { id }, data });
      await writeAudit(tx, {
        entityType: "category",
        entityId: id,
        actorId: actor.id,
        action: "updated",
        diff,
      });
    }),
  );
}

export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, "admin.categories");
  await getPrisma().$transaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundError();
    if ((await tx.category.count({ where: { parentId: id } })) > 0)
      throw new ConflictError("has_children");
    if ((await tx.ticket.count({ where: { categoryId: id } })) > 0)
      throw new ConflictError("in_use");
    await tx.category.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "category",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: category.name },
    });
  });
}
