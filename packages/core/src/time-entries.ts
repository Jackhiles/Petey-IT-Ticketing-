import { getPrisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor } from "./permissions";
import { findVisibleTicket } from "./tickets";
import { parse } from "./validation";

export const timeEntrySchema = z.object({
  minutes: z.coerce
    .number()
    .int({ message: "invalid" })
    .min(1, { message: "minutes_range" })
    .max(24 * 60, { message: "minutes_range" }),
  note: z.string().trim().max(500).default(""),
  /** When the work happened; defaults to now. Stored in UTC. */
  workedAt: z.coerce.date().optional(),
});

/** Logs time on a ticket on its own, without a reply. */
export async function logTime(actor: Actor, ticketId: string, input: unknown): Promise<string> {
  if (!can(actor, "ticket.logTime")) throw new ForbiddenError();
  const data = parse(timeEntrySchema, input);
  return getPrisma().$transaction(async (tx) => {
    await findVisibleTicket(tx, actor, ticketId);
    const entry = await tx.timeEntry.create({
      data: {
        ticketId,
        userId: actor.id,
        minutes: data.minutes,
        note: data.note,
        workedAt: data.workedAt ?? new Date(),
      },
    });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: ticketId,
      actorId: actor.id,
      action: "time_logged",
      diff: { minutes: data.minutes, note: data.note },
    });
    return entry.id;
  });
}

/** People delete their own entries; admins can delete anyone's. */
export async function deleteTimeEntry(actor: Actor, entryId: string): Promise<void> {
  if (!can(actor, "ticket.logTime")) throw new ForbiddenError();
  await getPrisma().$transaction(async (tx) => {
    const entry = await tx.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError();
    if (entry.userId !== actor.id && actor.role !== "admin") throw new ForbiddenError();
    await tx.timeEntry.delete({ where: { id: entryId } });
    await writeAudit(tx, {
      entityType: "ticket",
      entityId: entry.ticketId,
      actorId: actor.id,
      action: "time_deleted",
      diff: { minutes: entry.minutes },
    });
  });
}
