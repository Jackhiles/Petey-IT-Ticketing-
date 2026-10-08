import { getPrisma, type Tx } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { htmlToText, sanitizeHtml } from "./html";
import { can, type Actor } from "./permissions";
import { formatTicketNumber, getTicketSettings, parseTicketNumber } from "./ticket-settings";
import { applyPatch, closedStatus, defaultStatus, findVisibleTicket } from "./tickets";
import { parse } from "./validation";

function requireLinking(actor: Actor): void {
  if (!can(actor, "ticket.mergeSplitLink")) throw new ForbiddenError();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Finds a ticket from "1234", "PTY-1234" or a UUID. */
async function resolveTicketRef(tx: Tx, actor: Actor, ref: string, field: string) {
  const id = z.uuid().safeParse(ref).success
    ? ref
    : await (async () => {
        const number = parseTicketNumber(ref);
        const t =
          number === null
            ? null
            : await tx.ticket.findUnique({ where: { number }, select: { id: true } });
        return t?.id ?? null;
      })();
  if (!id) throw new ValidationError({ [field]: "ticket_not_found" });
  return findVisibleTicket(tx, actor, id).catch(() => {
    throw new ValidationError({ [field]: "ticket_not_found" });
  });
}

async function isMerged(tx: Tx, ticketId: string): Promise<boolean> {
  return (
    (await tx.ticketLink.count({ where: { fromTicketId: ticketId, linkType: "merged_into" } })) > 0
  );
}

// --- Links ------------------------------------------------------------------------------

export const linkSchema = z.object({
  /** The other ticket: its number (with or without prefix) or id. */
  other: z.string().trim().min(1, { message: "required" }).max(50),
  /** How the other ticket relates to this one. */
  kind: z.enum(["parent", "child", "related"]),
});

/** Links two tickets as parent/child or related. */
export async function linkTickets(actor: Actor, ticketId: string, input: unknown): Promise<string> {
  requireLinking(actor);
  const data = parse(linkSchema, input);
  return getPrisma().$transaction(async (tx) => {
    const ticket = await findVisibleTicket(tx, actor, ticketId);
    const other = await resolveTicketRef(tx, actor, data.other, "other");
    if (other.id === ticket.id) throw new ValidationError({ other: "cannot_link_self" });

    // Stored as (from, to): a parent link points from the parent to the child.
    const [fromTicketId, toTicketId] =
      data.kind === "parent" ? [other.id, ticket.id] : [ticket.id, other.id];
    const linkType = data.kind === "related" ? "related" : "parent";

    const existing = await tx.ticketLink.findFirst({
      where: {
        OR: [
          { fromTicketId, toTicketId },
          { fromTicketId: toTicketId, toTicketId: fromTicketId },
        ],
        linkType: { in: ["parent", "related"] },
      },
    });
    if (existing) throw new ConflictError("already_linked", { other: "already_linked" });
    if (linkType === "parent") {
      // One level of nesting: a child can't have its own parent elsewhere, and can't be a parent.
      const childHasParent = await tx.ticketLink.count({
        where: { toTicketId, linkType: "parent" },
      });
      if (childHasParent > 0)
        throw new ConflictError("already_has_parent", { other: "already_has_parent" });
    }

    const link = await tx.ticketLink.create({ data: { fromTicketId, toTicketId, linkType } });
    const { prefix } = await getTicketSettings();
    for (const [id, otherNumber] of [
      [ticket.id, other.number],
      [other.id, ticket.number],
    ] as const) {
      await writeAudit(tx, {
        entityType: "ticket",
        entityId: id,
        actorId: actor.id,
        action: "linked",
        diff: { kind: data.kind, ticket: formatTicketNumber(otherNumber, prefix) },
      });
    }
    return link.id;
  });
}

export async function unlinkTickets(actor: Actor, ticketId: string, linkId: string): Promise<void> {
  requireLinking(actor);
  await getPrisma().$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, ticketId);
    const link = await tx.ticketLink.findFirst({
      where: { id: linkId, OR: [{ fromTicketId: ticketId }, { toTicketId: ticketId }] },
    });
    if (!link) throw new NotFoundError();
    if (link.linkType === "merged_into") throw new ConflictError("cannot_unlink_merge");
    await tx.ticketLink.delete({ where: { id: link.id } });
    for (const id of [link.fromTicketId, link.toTicketId]) {
      await writeAudit(tx, {
        entityType: "ticket",
        entityId: id,
        actorId: actor.id,
        action: "unlinked",
        diff: { linkType: link.linkType },
      });
    }
  });
}

// --- Merge ------------------------------------------------------------------------------

export const mergeSchema = z.object({
  /** The ticket that stays open and receives everything. */
  into: z.string().trim().min(1, { message: "required" }).max(50),
});

/**
 * Merges a duplicate into another ticket. Every message, attachment, watcher, tag and time
 * entry moves to the target; the duplicate's description becomes a message there; the
 * duplicate is closed and linked to the target as merged_into.
 */
export async function mergeTickets(
  actor: Actor,
  sourceId: string,
  input: unknown,
): Promise<{ targetId: string }> {
  requireLinking(actor);
  const data = parse(mergeSchema, input);
  return getPrisma().$transaction(async (tx) => {
    const source = await findVisibleTicket(tx, actor, sourceId);
    const target = await resolveTicketRef(tx, actor, data.into, "into");
    if (target.id === source.id) throw new ValidationError({ into: "cannot_merge_self" });
    if (await isMerged(tx, source.id)) throw new ConflictError("already_merged");
    if (await isMerged(tx, target.id)) throw new ValidationError({ into: "target_merged" });

    const { prefix } = await getTicketSettings();
    const sourceNumber = formatTicketNumber(source.number, prefix);
    const targetNumber = formatTicketNumber(target.number, prefix);

    // The duplicate's description becomes a public message on the target, written by its
    // requester and dated when they raised it, so the conversation reads in order.
    const intro = `<p><em>Merged from ${escapeHtml(sourceNumber)}: ${escapeHtml(source.subject)}</em></p>`;
    const bodyHtml = sanitizeHtml(intro + source.descriptionHtml);
    const description = await tx.ticketMessage.create({
      data: {
        ticketId: target.id,
        authorId: source.requesterId,
        bodyHtml,
        bodyText: htmlToText(bodyHtml),
        isInternal: false,
        source: source.source,
        createdAt: source.createdAt,
      },
    });

    await tx.ticketMessage.updateMany({
      where: { ticketId: source.id, id: { not: description.id } },
      data: { ticketId: target.id },
    });
    await tx.attachment.updateMany({
      where: { ticketId: source.id, messageId: null },
      data: { messageId: description.id },
    });
    await tx.attachment.updateMany({
      where: { ticketId: source.id },
      data: { ticketId: target.id },
    });
    await tx.timeEntry.updateMany({
      where: { ticketId: source.id },
      data: { ticketId: target.id },
    });

    // Watchers: the duplicate's watchers, plus its requester if they differ, now watch the target.
    const targetWatchers = new Set(
      (
        await tx.ticketWatcher.findMany({ where: { ticketId: target.id }, select: { email: true } })
      ).map((w) => w.email),
    );
    const targetRequester = await tx.user.findUniqueOrThrow({
      where: { id: target.requesterId },
      select: { email: true },
    });
    const candidates = await tx.ticketWatcher.findMany({ where: { ticketId: source.id } });
    if (source.requesterId !== target.requesterId) {
      const r = await tx.user.findUniqueOrThrow({
        where: { id: source.requesterId },
        select: { id: true, email: true },
      });
      candidates.push({
        id: "",
        ticketId: source.id,
        userId: r.id,
        email: r.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    for (const w of candidates) {
      if (targetWatchers.has(w.email) || w.email === targetRequester.email) continue;
      targetWatchers.add(w.email);
      await tx.ticketWatcher.create({
        data: { ticketId: target.id, userId: w.userId, email: w.email },
      });
    }

    const sourceTags = await tx.ticketTag.findMany({ where: { ticketId: source.id } });
    await tx.ticketTag.createMany({
      data: sourceTags.map((t) => ({ ticketId: target.id, tagId: t.tagId })),
      skipDuplicates: true,
    });

    await tx.ticketLink.create({
      data: { fromTicketId: source.id, toTicketId: target.id, linkType: "merged_into" },
    });
    await tx.ticket.update({ where: { id: target.id }, data: { updatedAt: new Date() } });
    if (source.status.type !== "closed") {
      await applyPatch(tx, actor, source.id, { statusId: (await closedStatus(tx)).id });
    }
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: source.id,
      actorId: actor.id,
      action: "merged_into",
      diff: { ticket: targetNumber },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: target.id,
      actorId: actor.id,
      action: "merged_from",
      diff: { ticket: sourceNumber },
    });
    return { targetId: target.id };
  });
}

// --- Split ------------------------------------------------------------------------------

export const splitSchema = z.object({
  subject: z.string().trim().min(1, { message: "required" }).max(200),
});

/**
 * Moves one message out of a ticket into a new ticket for the same requester. The message
 * becomes the new ticket's description and its attachments go with it; the two tickets are
 * linked as related.
 */
export async function splitMessage(
  actor: Actor,
  messageId: string,
  input: unknown,
): Promise<{ id: string; number: number }> {
  requireLinking(actor);
  const data = parse(splitSchema, input);
  return getPrisma().$transaction(async (tx) => {
    const message = await tx.ticketMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundError();
    const source = await findVisibleTicket(tx, actor, message.ticketId);
    // A description is public, so an internal note can't become one.
    if (message.isInternal) throw new ConflictError("cannot_split_internal");

    const created = await tx.ticket.create({
      data: {
        subject: data.subject,
        descriptionHtml: message.bodyHtml,
        descriptionText: message.bodyText,
        type: source.type,
        statusId: (await defaultStatus(tx)).id,
        priorityId: source.priorityId,
        categoryId: source.categoryId,
        requesterId: source.requesterId,
        groupId: source.groupId,
        source: message.source,
      },
    });
    await tx.attachment.updateMany({
      where: { messageId },
      data: { ticketId: created.id, messageId: null },
    });
    await tx.ticketMessage.delete({ where: { id: messageId } });
    await tx.ticketLink.create({
      data: { fromTicketId: source.id, toTicketId: created.id, linkType: "related" },
    });
    await tx.ticket.update({ where: { id: source.id }, data: { updatedAt: new Date() } });

    const { prefix } = await getTicketSettings();
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: created.id,
      actorId: actor.id,
      action: "created",
      diff: { subject: data.subject, splitFrom: formatTicketNumber(source.number, prefix) },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: source.id,
      actorId: actor.id,
      action: "split",
      diff: { ticket: formatTicketNumber(created.number, prefix) },
    });
    return { id: created.id, number: created.number };
  });
}
