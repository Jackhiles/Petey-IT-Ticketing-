import { getPrisma, type Tx } from "@petey/db";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { MIN_PASSWORD_LENGTH } from "./auth";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor, type Role } from "./permissions";
import { parse } from "./validation";

export const ROLES = ["requester", "technician", "admin"] as const satisfies readonly Role[];

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "invalid_email" }));
const name = z.string().trim().min(1, { message: "required" }).max(200);
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: "password_too_short" })
  .max(128, { message: "password_too_long" });
const departmentId = z
  .union([z.uuid(), z.literal("")])
  .transform((v) => v || null)
  .nullable()
  .optional();

export const createUserSchema = z.object({
  name,
  email,
  role: z.enum(ROLES),
  departmentId,
  password,
});

export const updateUserSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  role: z.enum(ROLES).optional(),
  departmentId,
  isActive: z.boolean().optional(),
});

export const setPasswordSchema = z.object({ password });

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  twoFactorEnabled: boolean;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: Date;
}

function requireAdmin(actor: Actor): void {
  if (!can(actor, "admin.users")) throw new ForbiddenError();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

const summarySelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  twoFactorEnabled: true,
  departmentId: true,
  createdAt: true,
  department: { select: { name: true } },
} as const;

type SummaryRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  departmentId: string | null;
  createdAt: Date;
  department: { name: string } | null;
};

function toSummary({ department, ...row }: SummaryRow): UserSummary {
  return { ...row, role: row.role as Role, departmentName: department?.name ?? null };
}

export async function listUsers(
  actor: Actor,
  filter: { query?: string; role?: Role } = {},
): Promise<UserSummary[]> {
  requireAdmin(actor);
  const q = filter.query?.trim();
  const rows = await getPrisma().user.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: summarySelect,
    take: 500,
  });
  return rows.map(toSummary);
}

export async function getUser(
  actor: Actor,
  id: string,
): Promise<UserSummary & { groupIds: string[] }> {
  requireAdmin(actor);
  const row = await getPrisma().user.findUnique({
    where: { id },
    select: { ...summarySelect, groupMemberships: { select: { groupId: true } } },
  });
  if (!row) throw new NotFoundError();
  const { groupMemberships, ...rest } = row;
  return { ...toSummary(rest), groupIds: groupMemberships.map((m) => m.groupId) };
}

/** Creates a user and their email-and-password credential. Shared with first-run setup. */
export async function insertUserWithPassword(
  tx: Tx,
  input: z.output<typeof createUserSchema>,
  actorId: string | null,
): Promise<string> {
  const passwordHash = await hashPassword(input.password);
  const user = await tx.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      departmentId: input.departmentId ?? null,
    },
  });
  await tx.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
  });
  await writeAudit(tx, {
    entityType: "user",
    entityId: user.id,
    actorId: actorId ?? user.id,
    action: "created",
    diff: {
      name: input.name,
      email: input.email,
      role: input.role,
      departmentId: input.departmentId ?? null,
    },
  });
  return user.id;
}

export async function createUser(actor: Actor, input: unknown): Promise<string> {
  requireAdmin(actor);
  const data = parse(createUserSchema, input);
  try {
    return await getPrisma().$transaction((tx) => insertUserWithPassword(tx, data, actor.id));
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("email_taken", { email: "email_taken" });
    throw err;
  }
}

export async function updateUser(actor: Actor, id: string, input: unknown): Promise<void> {
  requireAdmin(actor);
  const data = parse(updateUserSchema, input);

  // Admins cannot lock themselves out: no demoting or deactivating your own account.
  if (id === actor.id) {
    if (data.role !== undefined && data.role !== "admin") {
      throw new ConflictError("cannot_demote_self", { role: "cannot_demote_self" });
    }
    if (data.isActive === false) {
      throw new ConflictError("cannot_deactivate_self", { isActive: "cannot_deactivate_self" });
    }
  }

  try {
    await getPrisma().$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const diff = diffFields(before, data);
      if (Object.keys(diff).length === 0) return;

      await tx.user.update({ where: { id }, data });
      // Deactivating, or changing a role, signs the user out everywhere.
      if (diff.isActive || diff.role) {
        await tx.session.deleteMany({ where: { userId: id } });
      }
      // Groups are for technicians; a user who becomes a requester leaves them.
      if (data.role === "requester") {
        await tx.groupMember.deleteMany({ where: { userId: id } });
      }
      await writeAudit(tx, {
        entityType: "user",
        entityId: id,
        actorId: actor.id,
        action: "updated",
        diff,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("email_taken", { email: "email_taken" });
    throw err;
  }
}

export async function setUserPassword(actor: Actor, id: string, input: unknown): Promise<void> {
  requireAdmin(actor);
  const { password: newPassword } = parse(setPasswordSchema, input);
  const passwordHash = await hashPassword(newPassword);

  await getPrisma().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundError();
    const updated = await tx.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (updated.count === 0) {
      await tx.account.create({
        data: { userId: id, accountId: id, providerId: "credential", password: passwordHash },
      });
    }
    await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, {
      entityType: "user",
      entityId: id,
      actorId: actor.id,
      action: "password_set",
    });
  });
}

/** Removes a user's two-factor enrollment, e.g. after they lose their phone. */
export async function resetUserTwoFactor(actor: Actor, id: string): Promise<void> {
  requireAdmin(actor);
  await getPrisma().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundError();
    await tx.twoFactor.deleteMany({ where: { userId: id } });
    await tx.user.update({ where: { id }, data: { twoFactorEnabled: false } });
    await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, {
      entityType: "user",
      entityId: id,
      actorId: actor.id,
      action: "two_factor_reset",
    });
  });
}

export async function listDepartments(): Promise<{ id: string; name: string }[]> {
  return getPrisma().department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
