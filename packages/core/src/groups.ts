import { getPrisma } from "@petey/db";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor, type Role } from "./permissions";
import { parse } from "./validation";

export const groupSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(100),
  description: z.string().trim().max(500).default(""),
});

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

export interface GroupDetail extends Omit<GroupSummary, "memberCount"> {
  members: { id: string; name: string; email: string; role: Role }[];
}

function requireAdmin(actor: Actor): void {
  if (!can(actor, "admin.groups")) throw new ForbiddenError();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

export async function listGroups(actor: Actor): Promise<GroupSummary[]> {
  requireAdmin(actor);
  const rows = await getPrisma().group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, _count: { select: { members: true } } },
  });
  return rows.map(({ _count, ...g }) => ({ ...g, memberCount: _count.members }));
}

export async function getGroup(actor: Actor, id: string): Promise<GroupDetail> {
  requireAdmin(actor);
  const row = await getPrisma().group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      members: {
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });
  if (!row) throw new NotFoundError();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: row.members.map((m) => ({ ...m.user, role: m.user.role as Role })),
  };
}

export async function createGroup(actor: Actor, input: unknown): Promise<string> {
  requireAdmin(actor);
  const data = parse(groupSchema, input);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const group = await tx.group.create({ data });
      await writeAudit(tx, {
        entityType: "group",
        entityId: group.id,
        actorId: actor.id,
        action: "created",
        diff: data,
      });
      return group.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("name_taken", { name: "name_taken" });
    throw err;
  }
}

export async function updateGroup(actor: Actor, id: string, input: unknown): Promise<void> {
  requireAdmin(actor);
  const data = parse(groupSchema, input);
  try {
    await getPrisma().$transaction(async (tx) => {
      const before = await tx.group.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;
      await tx.group.update({ where: { id }, data });
      await writeAudit(tx, {
        entityType: "group",
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

export async function deleteGroup(actor: Actor, id: string): Promise<void> {
  requireAdmin(actor);
  await getPrisma().$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundError();
    await tx.group.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "group",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: group.name },
    });
  });
}

/** Adds a technician or admin to a group. Requesters cannot be group members. */
export async function addGroupMember(actor: Actor, groupId: string, userId: string): Promise<void> {
  requireAdmin(actor);
  await getPrisma().$transaction(async (tx) => {
    // A transaction has one connection, so its queries run one after another.
    const group = await tx.group.findUnique({ where: { id: groupId }, select: { id: true } });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!group || !user) throw new NotFoundError();
    if (user.role === "requester")
      throw new ConflictError("requester_not_allowed", { userId: "requester_not_allowed" });
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existing) return;
    await tx.groupMember.create({ data: { groupId, userId } });
    await writeAudit(tx, {
      entityType: "group",
      entityId: groupId,
      actorId: actor.id,
      action: "member_added",
      diff: { userId },
    });
  });
}

export async function removeGroupMember(
  actor: Actor,
  groupId: string,
  userId: string,
): Promise<void> {
  requireAdmin(actor);
  await getPrisma().$transaction(async (tx) => {
    const removed = await tx.groupMember.deleteMany({ where: { groupId, userId } });
    if (removed.count === 0) return;
    await writeAudit(tx, {
      entityType: "group",
      entityId: groupId,
      actorId: actor.id,
      action: "member_removed",
      diff: { userId },
    });
  });
}
