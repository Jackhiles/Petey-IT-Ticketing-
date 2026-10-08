import { getPrisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import type { Actor } from "./permissions";
import { findVisibleTicket, requireWork } from "./tickets";
import { parse } from "./validation";

// Watchers get a ticket's updates without owning it. Delivery arrives with email in
// Phase 4; until then the list is kept and shown on the ticket.

const addWatcherSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "invalid_email" })),
});

/** Adds a watcher by address, linking them to a Petey user when one has that email. */
export async function addWatcher(actor: Actor, ticketId: string, input: unknown): Promise<string> {
  requireWork(actor);
  const { email } = parse(addWatcherSchema, input);
  return getPrisma().$transaction(async (tx) => {
    const ticket = await findVisibleTicket(tx, actor, ticketId);
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (user?.id === ticket.requesterId)
      throw new ConflictError("watcher_is_requester", { email: "watcher_is_requester" });
    const existing = await tx.ticketWatcher.findUnique({
      where: { ticketId_email: { ticketId, email } },
    });
    if (existing) return existing.id;
    const watcher = await tx.ticketWatcher.create({
      data: { ticketId, email, userId: user?.id ?? null },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticketId,
      actorId: actor.id,
      action: "watcher_added",
      diff: { email },
    });
    return watcher.id;
  });
}

export async function removeWatcher(
  actor: Actor,
  ticketId: string,
  watcherId: string,
): Promise<void> {
  requireWork(actor);
  await getPrisma().$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, ticketId);
    const watcher = await tx.ticketWatcher.findFirst({ where: { id: watcherId, ticketId } });
    if (!watcher) throw new NotFoundError();
    await tx.ticketWatcher.delete({ where: { id: watcher.id } });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticketId,
      actorId: actor.id,
      action: "watcher_removed",
      diff: { email: watcher.email },
    });
  });
}
