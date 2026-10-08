import { getPrisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ForbiddenError } from "./errors";
import { can, type Actor } from "./permissions";
import { parse } from "./validation";

export const ticketSettingsSchema = z.object({
  /** Shown before every ticket number, e.g. "PTY-" in PTY-1234. Changing it renumbers nothing. */
  prefix: z
    .string()
    .trim()
    .min(1, { message: "required" })
    .max(10, { message: "prefix_too_long" })
    .regex(/^[A-Za-z][A-Za-z0-9]*-?$/, { message: "prefix_invalid" })
    .transform((p) => p.toUpperCase()),
});
export type TicketSettings = z.infer<typeof ticketSettingsSchema>;

const KEY = "tickets";
export const TICKET_SETTINGS_DEFAULTS: TicketSettings = { prefix: "PTY-" };

export async function getTicketSettings(): Promise<TicketSettings> {
  const row = await getPrisma().setting.findUnique({ where: { key: KEY } });
  const parsed = ticketSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : TICKET_SETTINGS_DEFAULTS;
}

export async function updateTicketSettings(actor: Actor, input: unknown): Promise<TicketSettings> {
  if (!can(actor, "admin.ticketSettings")) throw new ForbiddenError();
  const next = parse(ticketSettingsSchema, input);
  const before = await getTicketSettings();
  await getPrisma().$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: next },
      update: { value: next },
    });
    await writeAudit(tx, {
      entityType: "setting",
      entityId: KEY,
      actorId: actor.id,
      action: "updated",
      diff: { from: before, to: next },
    });
  });
  return next;
}

export function formatTicketNumber(number: number, prefix: string): string {
  return `${prefix}${number}`;
}

/**
 * Reads a ticket number out of search text: "1234", "#1234", "PTY-1234" or any other
 * prefix followed by digits, so references keep working after the prefix changes.
 */
export function parseTicketNumber(text: string): number | null {
  const match = /^\s*(?:#|[A-Za-z][A-Za-z0-9]*-?)?(\d{1,9})\s*$/.exec(text);
  return match?.[1] ? Number(match[1]) : null;
}
