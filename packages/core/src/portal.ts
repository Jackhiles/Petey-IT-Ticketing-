// The requester's side of tickets: their own list, marking a ticket resolved, reopening.
// Every query here is scoped to the actor's own tickets and public messages only.
import { getPrisma, type Prisma } from "@petey/db";
import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor } from "./permissions";
import type { StatusType } from "./ticket-config";
import { formatTicketNumber, getTicketSettings } from "./ticket-settings";
import { applyPatch, defaultStatus } from "./tickets";
import { parse } from "./validation";

export const myTicketsQuerySchema = z.object({
  /** open = not resolved or closed; done = resolved or closed. */
  view: z.enum(["open", "done", "all"]).catch("open").default("open"),
  q: z.string().trim().max(200).optional(),
});

export interface MyTicketItem {
  id: string;
  displayNumber: string;
  subject: string;
  status: { name: string; type: StatusType };
  createdAt: Date;
  updatedAt: Date;
  /** The last public message was from a technician, so the requester may need to act. */
  awaitingRequester: boolean;
}

/** A requester's own tickets, newest activity first. Search covers public text only. */
export async function listMyTickets(actor: Actor, input: unknown): Promise<MyTicketItem[]> {
  if (!can(actor, "ticket.viewOwn")) throw new ForbiddenError();
  const q = parse(myTicketsQuerySchema, input ?? {});
  const where: Prisma.TicketWhereInput[] = [{ requesterId: actor.id }];
  if (q.view === "open") where.push({ status: { type: { in: ["open", "on_hold"] } } });
  if (q.view === "done") where.push({ status: { type: { in: ["resolved", "closed"] } } });
  if (q.q) {
    const contains = { contains: q.q, mode: "insensitive" as const };
    where.push({
      OR: [
        { subject: contains },
        { descriptionText: contains },
        // Internal notes are excluded so they can't be found by guessing their words.
        { messages: { some: { isInternal: false, bodyText: contains } } },
      ],
    });
  }

  const [rows, { prefix }] = await Promise.all([
    getPrisma().ticket.findMany({
      where: { AND: where },
      orderBy: [{ updatedAt: "desc" }, { number: "desc" }],
      take: 200,
      select: {
        id: true,
        number: true,
        subject: true,
        createdAt: true,
        updatedAt: true,
        status: { select: { name: true, type: true } },
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorId: true },
        },
      },
    }),
    getTicketSettings(),
  ]);
  return rows.map((t) => ({
    id: t.id,
    displayNumber: formatTicketNumber(t.number, prefix),
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    awaitingRequester:
      (t.status.type === "open" || t.status.type === "on_hold") &&
      (t.messages[0]?.authorId ?? actor.id) !== actor.id,
  }));
}

/** Loads one of the actor's own tickets, or reports it as not found. */
async function ownTicket(actor: Actor, ticketId: string) {
  if (!z.uuid().safeParse(ticketId).success) throw new NotFoundError();
  const ticket = await getPrisma().ticket.findUnique({
    where: { id: ticketId },
    include: { status: true },
  });
  if (
    !ticket ||
    !can(actor, "ticket.replyOwn", { ownerId: ticket.requesterId }) ||
    ticket.requesterId !== actor.id
  ) {
    throw new NotFoundError();
  }
  return ticket;
}

/** The requester says their problem is solved. */
export async function markOwnTicketResolved(actor: Actor, ticketId: string): Promise<void> {
  const ticket = await ownTicket(actor, ticketId);
  if (ticket.status.type === "resolved" || ticket.status.type === "closed") {
    throw new ConflictError("already_resolved");
  }
  await getPrisma().$transaction(async (tx) => {
    const resolved = await tx.status.findFirst({
      where: { type: "resolved" },
      orderBy: { sortOrder: "asc" },
    });
    // With no resolved status configured, the first closed one stands in.
    const target =
      resolved ??
      (await tx.status.findFirst({ where: { type: "closed" }, orderBy: { sortOrder: "asc" } }));
    if (!target) throw new ConflictError("need_closed_status");
    await applyPatch(tx, actor, ticketId, { statusId: target.id });
  });
}

/** Reopens a resolved ticket. Closed tickets are final: the requester raises a new one. */
export async function reopenOwnTicket(actor: Actor, ticketId: string): Promise<void> {
  const ticket = await ownTicket(actor, ticketId);
  if (ticket.status.type === "closed") throw new ConflictError("ticket_closed");
  if (ticket.status.type !== "resolved") throw new ConflictError("not_resolved");
  await getPrisma().$transaction(async (tx) => {
    await applyPatch(tx, actor, ticketId, { statusId: (await defaultStatus(tx)).id });
  });
}
