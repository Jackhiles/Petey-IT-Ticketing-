import { getPrisma, type Prisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ticketTemplateValues } from "./canned-responses";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { isBlankHtml, sanitizeHtml } from "./html";
import { can, type Actor } from "./permissions";
import { canManage, checkSharing, sharingSchema, visibleToActor, type Sharing } from "./sharing";
import { replaceTags } from "./tags";
import { renderTemplate } from "./templates";
import { applyPatch, findVisibleTicket, insertMessage, type TicketPatch } from "./tickets";
import { parse } from "./validation";

// A macro is a list of actions applied to one ticket in one click. The action shape is the
// one automation rules will reuse in Phase 6.

const uuid = z.uuid();

export const macroActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), statusId: uuid }),
  z.object({ type: z.literal("set_priority"), priorityId: uuid }),
  z.object({ type: z.literal("set_type"), ticketType: z.enum(["incident", "request"]) }),
  /** "me" is whoever runs the macro. */
  z.object({
    type: z.literal("assign"),
    to: z.union([z.literal("me"), z.literal("unassigned"), uuid]),
  }),
  z.object({ type: z.literal("set_group"), groupId: uuid.nullable() }),
  z.object({ type: z.literal("add_tags"), tagIds: z.array(uuid).min(1) }),
  z.object({ type: z.literal("remove_tags"), tagIds: z.array(uuid).min(1) }),
  /** HTML with {{variables}}. */
  z.object({
    type: z.literal("reply"),
    bodyHtml: z.string().min(1).max(50_000),
    internal: z.boolean(),
  }),
]);
export type MacroAction = z.infer<typeof macroActionSchema>;

export const macroSchema = z
  .object({
    name: z.string().trim().min(1, { message: "required" }).max(100),
    actions: z.array(macroActionSchema).min(1, { message: "required" }).max(20),
  })
  .and(sharingSchema);

export interface MacroSummary {
  id: string;
  name: string;
  actions: MacroAction[];
  visibility: Sharing;
  sharedGroupId: string | null;
  ownerId: string;
  ownerName: string;
  canManage: boolean;
}

function requireUse(actor: Actor): void {
  if (!can(actor, "macro.usePersonal")) throw new ForbiddenError();
}

export async function listMacros(actor: Actor): Promise<MacroSummary[]> {
  requireUse(actor);
  const prisma = getPrisma();
  const rows = await prisma.macro.findMany({
    where: await visibleToActor(prisma, actor),
    orderBy: { name: "asc" },
    include: { owner: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    // A macro whose stored actions no longer parse shows with none and can't run.
    actions: z.array(macroActionSchema).catch([]).parse(r.actions),
    visibility: r.visibility,
    sharedGroupId: r.sharedGroupId,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    canManage: canManage(actor, r),
  }));
}

export async function createMacro(actor: Actor, input: unknown): Promise<string> {
  requireUse(actor);
  const data = parse(macroSchema, input);
  return getPrisma().$transaction(async (tx) => {
    await checkSharing(tx, actor, "macro.usePersonal", data);
    const row = await tx.macro.create({
      data: {
        name: data.name,
        actions: data.actions as Prisma.InputJsonArray,
        ownerId: actor.id,
        visibility: data.visibility,
        sharedGroupId: data.visibility === "group" ? data.sharedGroupId : null,
      },
    });
    await writeAudit(tx, {
      entityType: "macro",
      entityId: row.id,
      actorId: actor.id,
      action: "created",
      diff: {
        name: data.name,
        visibility: data.visibility,
        actions: data.actions.map((a) => a.type),
      },
    });
    return row.id;
  });
}

export async function deleteMacro(actor: Actor, id: string): Promise<void> {
  requireUse(actor);
  await getPrisma().$transaction(async (tx) => {
    const row = await tx.macro.findUnique({ where: { id } });
    if (!row || (row.visibility === "personal" && row.ownerId !== actor.id))
      throw new NotFoundError();
    if (!canManage(actor, row)) throw new ForbiddenError();
    await tx.macro.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "macro",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: row.name },
    });
  });
}

/**
 * Runs every action of a macro on one ticket, in one transaction: either all of it happens
 * or none of it does. Field changes are recorded in history like any other edit.
 */
export async function runMacro(actor: Actor, macroId: string, ticketId: string): Promise<void> {
  requireUse(actor);
  if (!can(actor, "ticket.work")) throw new ForbiddenError();
  const prisma = getPrisma();
  const macro = await prisma.macro.findFirst({
    where: { AND: [{ id: macroId }, await visibleToActor(prisma, actor)] },
  });
  if (!macro) throw new NotFoundError();
  const parsed = z.array(macroActionSchema).safeParse(macro.actions);
  if (!parsed.success) throw new ValidationError({ actions: "macro_invalid" });
  const actions = parsed.data;

  await prisma.$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, ticketId);
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticketId,
      actorId: actor.id,
      action: "macro_run",
      diff: { macro: macro.name },
    });

    for (const action of actions.filter((a) => a.type === "reply")) {
      if (action.type !== "reply") continue;
      if (action.internal && !can(actor, "ticket.addInternalNote")) throw new ForbiddenError();
      const bodyHtml = sanitizeHtml(
        renderTemplate(action.bodyHtml, await ticketTemplateValues(tx, actor, ticketId)),
      );
      if (isBlankHtml(bodyHtml)) continue;
      await insertMessage(tx, actor, ticketId, {
        bodyHtml,
        isInternal: action.internal,
        stored: [],
      });
    }

    // Field changes become one history entry, as if made by hand together.
    const patch: TicketPatch = {};
    for (const action of actions) {
      if (action.type === "set_status") patch.statusId = action.statusId;
      else if (action.type === "set_priority") patch.priorityId = action.priorityId;
      else if (action.type === "set_type") patch.type = action.ticketType;
      else if (action.type === "assign")
        patch.assigneeId =
          action.to === "me" ? actor.id : action.to === "unassigned" ? null : action.to;
      else if (action.type === "set_group") patch.groupId = action.groupId;
    }
    if (Object.keys(patch).length > 0) await applyPatch(tx, actor, ticketId, patch);

    const tagChanges = actions.filter((a) => a.type === "add_tags" || a.type === "remove_tags");
    if (tagChanges.length > 0) {
      const current = new Set(
        (await tx.ticketTag.findMany({ where: { ticketId } })).map((t) => t.tagId),
      );
      for (const a of tagChanges) {
        if (a.type === "add_tags") a.tagIds.forEach((id) => current.add(id));
        if (a.type === "remove_tags") a.tagIds.forEach((id) => current.delete(id));
      }
      await replaceTags(tx, actor, ticketId, current);
    }
  });
}
