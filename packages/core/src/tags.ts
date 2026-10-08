import { getPrisma, type Tx } from "@petey/db";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { can, type Actor } from "./permissions";
import { findVisibleTicket, requireWork } from "./tickets";
import { parse } from "./validation";

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

export const tagSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "invalid_color" }),
});

function requireAdmin(actor: Actor): void {
  if (!can(actor, "admin.tags")) throw new ForbiddenError();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Every tag, for pickers and filters. */
export async function listTags(): Promise<TagOption[]> {
  return getPrisma().tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

/** Ticket counts per tag, for the admin screen. */
export async function tagUsage(): Promise<Record<string, number>> {
  const rows = await getPrisma().ticketTag.groupBy({ by: ["tagId"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.tagId, r._count._all]));
}

export async function createTag(actor: Actor, input: unknown): Promise<string> {
  requireAdmin(actor);
  const data = parse(tagSchema, input);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const tag = await tx.tag.create({ data });
      await writeAudit(tx, {
        entityType: "tag",
        entityId: tag.id,
        actorId: actor.id,
        action: "created",
        diff: data,
      });
      return tag.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("name_taken", { name: "name_taken" });
    throw err;
  }
}

export async function updateTag(actor: Actor, id: string, input: unknown): Promise<void> {
  requireAdmin(actor);
  const data = parse(tagSchema, input);
  try {
    await getPrisma().$transaction(async (tx) => {
      const before = await tx.tag.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;
      await tx.tag.update({ where: { id }, data });
      await writeAudit(tx, {
        entityType: "tag",
        entityId: id,
        actorId: actor.id,
        action: "updated",
        diff,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("name_taken", { name: "name_taken" });
    throw err;
  }
}

/** Deleting a tag removes it from every ticket. */
export async function deleteTag(actor: Actor, id: string): Promise<void> {
  requireAdmin(actor);
  await getPrisma().$transaction(async (tx) => {
    const tag = await tx.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundError();
    await tx.tag.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "tag",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: tag.name },
    });
  });
}

/** Replaces a ticket's tags, recording what was added and removed in its history. */
export async function setTicketTags(
  actor: Actor,
  ticketId: string,
  tagIds: unknown,
): Promise<void> {
  requireWork(actor);
  const ids = parse(z.array(z.uuid()).max(50), tagIds);
  await getPrisma().$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, ticketId);
    await replaceTags(tx, actor, ticketId, new Set(ids));
  });
}

/** Shared with macros: sets the ticket's tags to `wanted` and audits the difference. */
export async function replaceTags(
  tx: Tx,
  actor: Actor,
  ticketId: string,
  wanted: Set<string>,
): Promise<boolean> {
  const tags = await tx.tag.findMany({ where: { id: { in: [...wanted] } } });
  if (tags.length !== wanted.size) throw new ValidationError({ tagIds: "not_found" });
  const current = await tx.ticketTag.findMany({ where: { ticketId }, include: { tag: true } });
  const have = new Set(current.map((c) => c.tagId));
  const added = tags.filter((t) => !have.has(t.id));
  const removed = current.filter((c) => !wanted.has(c.tagId));
  if (added.length === 0 && removed.length === 0) return false;

  await tx.ticketTag.deleteMany({
    where: { ticketId, tagId: { in: removed.map((r) => r.tagId) } },
  });
  await tx.ticketTag.createMany({ data: added.map((t) => ({ ticketId, tagId: t.id })) });
  await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  await writeAudit(tx, {
    entityType: "ticket",
    entityId: ticketId,
    actorId: actor.id,
    action: "tagged",
    diff: { added: added.map((t) => t.name), removed: removed.map((r) => r.tag.name) },
  });
  return true;
}
