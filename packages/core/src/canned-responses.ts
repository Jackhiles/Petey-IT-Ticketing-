import { getPrisma, type Tx } from "@petey/db";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { ForbiddenError, NotFoundError } from "./errors";
import { sanitizeHtml } from "./html";
import { can, type Actor } from "./permissions";
import { canManage, checkSharing, sharingSchema, visibleToActor, type Sharing } from "./sharing";
import { renderTemplate, templateValues, type TemplateValues } from "./templates";
import { formatTicketNumber, getTicketSettings } from "./ticket-settings";
import { findVisibleTicket } from "./tickets";
import { parse } from "./validation";

export const cannedResponseSchema = z
  .object({
    title: z.string().trim().min(1, { message: "required" }).max(100),
    body: z.string().min(1, { message: "required" }).max(50_000),
  })
  .and(sharingSchema);

export interface CannedResponseSummary {
  id: string;
  title: string;
  body: string;
  visibility: Sharing;
  sharedGroupId: string | null;
  ownerId: string;
  ownerName: string;
  canManage: boolean;
}

function requireUse(actor: Actor): void {
  if (!can(actor, "cannedResponse.usePersonal")) throw new ForbiddenError();
}

/** The values a ticket gives {{variables}}, as seen by the technician using them. */
export async function ticketTemplateValues(
  tx: Tx,
  actor: Actor,
  ticketId: string,
): Promise<TemplateValues> {
  await findVisibleTicket(tx, actor, ticketId);
  const t = await tx.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { status: true, priority: true, requester: { select: { name: true, email: true } } },
  });
  const agent = await tx.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { name: true },
  });
  const { prefix } = await getTicketSettings();
  return templateValues({
    ticket: {
      displayNumber: formatTicketNumber(t.number, prefix),
      subject: t.subject,
      status: t.status.name,
      priority: t.priority.name,
    },
    requester: t.requester,
    agent,
  });
}

/** Canned responses the actor can use, optionally filtered by text in the title or body. */
export async function listCannedResponses(
  actor: Actor,
  query = "",
): Promise<CannedResponseSummary[]> {
  requireUse(actor);
  const prisma = getPrisma();
  const q = query.trim();
  const rows = await prisma.cannedResponse.findMany({
    where: {
      AND: [
        await visibleToActor(prisma, actor),
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { body: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: { title: "asc" },
    include: { owner: { select: { name: true } } },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    visibility: r.visibility,
    sharedGroupId: r.sharedGroupId,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    canManage: canManage(actor, r),
  }));
}

/** A canned response with this ticket's values filled in, ready to insert into a reply. */
export async function renderCannedResponse(
  actor: Actor,
  id: string,
  ticketId: string,
): Promise<string> {
  requireUse(actor);
  const prisma = getPrisma();
  const row = await prisma.cannedResponse.findFirst({
    where: { AND: [{ id }, await visibleToActor(prisma, actor)] },
  });
  if (!row) throw new NotFoundError();
  return sanitizeHtml(
    renderTemplate(row.body, await ticketTemplateValues(prisma, actor, ticketId)),
  );
}

export async function createCannedResponse(actor: Actor, input: unknown): Promise<string> {
  requireUse(actor);
  const data = parse(cannedResponseSchema, input);
  return getPrisma().$transaction(async (tx) => {
    await checkSharing(tx, actor, "cannedResponse.usePersonal", data);
    const row = await tx.cannedResponse.create({
      data: {
        title: data.title,
        body: sanitizeHtml(data.body),
        ownerId: actor.id,
        visibility: data.visibility,
        sharedGroupId: data.visibility === "group" ? data.sharedGroupId : null,
      },
    });
    await writeAudit(tx, {
      entityType: "canned_response",
      entityId: row.id,
      actorId: actor.id,
      action: "created",
      diff: { title: data.title, visibility: data.visibility },
    });
    return row.id;
  });
}

export async function updateCannedResponse(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<void> {
  requireUse(actor);
  const data = parse(cannedResponseSchema, input);
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.cannedResponse.findUnique({ where: { id } });
    if (!before || (before.visibility === "personal" && before.ownerId !== actor.id))
      throw new NotFoundError();
    if (!canManage(actor, before)) throw new ForbiddenError();
    await checkSharing(tx, actor, "cannedResponse.usePersonal", data);
    const next = {
      title: data.title,
      body: sanitizeHtml(data.body),
      visibility: data.visibility,
      sharedGroupId: data.visibility === "group" ? data.sharedGroupId : null,
    };
    const diff = diffFields(before, next);
    if (Object.keys(diff).length === 0) return;
    await tx.cannedResponse.update({ where: { id }, data: next });
    await writeAudit(tx, {
      entityType: "canned_response",
      entityId: id,
      actorId: actor.id,
      action: "updated",
      diff,
    });
  });
}

export async function deleteCannedResponse(actor: Actor, id: string): Promise<void> {
  requireUse(actor);
  await getPrisma().$transaction(async (tx) => {
    const row = await tx.cannedResponse.findUnique({ where: { id } });
    if (!row || (row.visibility === "personal" && row.ownerId !== actor.id))
      throw new NotFoundError();
    if (!canManage(actor, row)) throw new ForbiddenError();
    await tx.cannedResponse.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "canned_response",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { title: row.title },
    });
  });
}
