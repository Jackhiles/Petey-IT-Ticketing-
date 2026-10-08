import { getPrisma } from "@petey/db";
import { z } from "zod";
import { ForbiddenError } from "./errors";
import { can, type Actor } from "./permissions";
import { findVisibleTicket } from "./tickets";

// Collision detection: technicians with a ticket open send a heartbeat every few seconds.
// Anyone seen in the last PRESENCE_WINDOW_MS is shown as viewing (or typing).

export const PRESENCE_WINDOW_MS = 30_000;
const CLEANUP_AFTER_MS = 10 * 60_000;

export interface PresenceView {
  /** Other technicians on the ticket now; never includes the caller. */
  viewers: { id: string; name: string; isTyping: boolean }[];
  /** The ticket's last change, so the page can warn that what it shows is out of date. */
  ticketUpdatedAt: Date;
}

export async function heartbeat(
  actor: Actor,
  ticketId: string,
  typing: unknown,
  now = new Date(),
): Promise<PresenceView> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  const isTyping = z.boolean().catch(false).parse(typing);
  const prisma = getPrisma();
  const ticket = await findVisibleTicket(prisma, actor, ticketId);

  await prisma.ticketPresence.upsert({
    where: { ticketId_userId: { ticketId, userId: actor.id } },
    create: { ticketId, userId: actor.id, isTyping, lastSeenAt: now },
    update: { isTyping, lastSeenAt: now },
  });
  // Old heartbeats are useless; clear them out as we go instead of running a job.
  await prisma.ticketPresence.deleteMany({
    where: { lastSeenAt: { lt: new Date(now.getTime() - CLEANUP_AFTER_MS) } },
  });

  const rows = await prisma.ticketPresence.findMany({
    where: {
      ticketId,
      userId: { not: actor.id },
      lastSeenAt: { gte: new Date(now.getTime() - PRESENCE_WINDOW_MS) },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return {
    viewers: rows.map((r) => ({ id: r.user.id, name: r.user.name, isTyping: r.isTyping })),
    ticketUpdatedAt: ticket.updatedAt,
  };
}

/** Called when the page closes, so others stop seeing the technician straight away. */
export async function leaveTicket(actor: Actor, ticketId: string): Promise<void> {
  await getPrisma().ticketPresence.deleteMany({ where: { ticketId, userId: actor.id } });
}
