import type { Prisma, Tx } from "@petey/db";
import { z } from "zod";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { can, type Action, type Actor } from "./permissions";

// Canned responses and macros are either personal (owner only) or shared with a group or
// with every technician. Technicians keep personal ones; admins manage the shared ones.

export const SHARING = ["personal", "group", "all"] as const;
export type Sharing = (typeof SHARING)[number];

export const sharingSchema = z.object({
  visibility: z.enum(SHARING).default("personal"),
  sharedGroupId: z
    .union([z.uuid(), z.literal("")])
    .transform((v) => v || null)
    .nullable()
    .default(null),
});

/** Rows the actor can use: their own, shared with all, or shared with one of their groups. */
export async function visibleToActor(
  tx: Tx,
  actor: Actor,
): Promise<Prisma.CannedResponseWhereInput & Prisma.MacroWhereInput> {
  const groups = await tx.groupMember.findMany({
    where: { userId: actor.id },
    select: { groupId: true },
  });
  return {
    OR: [
      { ownerId: actor.id, visibility: "personal" },
      { visibility: "all" },
      // Admins manage every shared item, so they see group-shared ones for any group.
      can(actor, "admin.sharedResponses")
        ? { visibility: "group" }
        : { visibility: "group", sharedGroupId: { in: groups.map((g) => g.groupId) } },
    ],
  };
}

/** Checks the actor may create or change an item with this sharing. */
export async function checkSharing(
  tx: Tx,
  actor: Actor,
  personalAction: Action,
  sharing: z.output<typeof sharingSchema>,
): Promise<void> {
  if (sharing.visibility === "personal") {
    if (!can(actor, personalAction)) throw new ForbiddenError();
    return;
  }
  if (!can(actor, "admin.sharedResponses")) throw new ForbiddenError();
  if (sharing.visibility === "group") {
    if (!sharing.sharedGroupId) throw new ValidationError({ sharedGroupId: "required" });
    const group = await tx.group.findUnique({ where: { id: sharing.sharedGroupId } });
    if (!group) throw new ValidationError({ sharedGroupId: "not_found" });
  } else if (sharing.sharedGroupId) {
    throw new ConflictError("invalid", { sharedGroupId: "invalid" });
  }
}

/** Owners manage their personal items; admins manage shared ones. */
export function canManage(actor: Actor, item: { ownerId: string; visibility: Sharing }): boolean {
  return item.visibility === "personal"
    ? item.ownerId === actor.id
    : can(actor, "admin.sharedResponses");
}
