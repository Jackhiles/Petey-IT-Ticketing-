import { getPrisma } from "@petey/db";
import { verifyPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { createFirstAdmin, needsSetup } from "./setup";
import { freshInstall, hasDatabase, makeUser, PASSWORD, resetDatabase } from "./test-support";
import { createUser, listUsers, resetUserTwoFactor, setUserPassword, updateUser } from "./users";
import type { Actor } from "./permissions";

describe.skipIf(!hasDatabase)("first-run setup", () => {
  beforeEach(resetDatabase);

  it("is needed until the first user exists, then refuses a second admin", async () => {
    expect(await needsSetup()).toBe(true);
    await createFirstAdmin({ name: "Ada", email: "Ada@Example.test", password: PASSWORD });
    expect(await needsSetup()).toBe(false);
    await expect(
      createFirstAdmin({ name: "Eve", email: "eve@example.test", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);

    const users = await getPrisma().user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "ada@example.test", role: "admin" });
  });

  it("creates exactly one admin when two setups race", async () => {
    const results = await Promise.allSettled([
      createFirstAdmin({ name: "A", email: "a@example.test", password: PASSWORD }),
      createFirstAdmin({ name: "B", email: "b@example.test", password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getPrisma().user.count()).toBe(1);
  });
});

describe.skipIf(!hasDatabase)("users service", () => {
  let admin: Actor;
  beforeEach(async () => {
    admin = await freshInstall();
  });

  it("creates a user with a hashed credential and an audit row", async () => {
    const id = await createUser(admin, {
      name: "Tess Tech",
      email: "TESS@example.test",
      role: "technician",
      password: PASSWORD,
    });
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user).toMatchObject({ email: "tess@example.test", role: "technician", isActive: true });

    const account = await prisma.account.findFirstOrThrow({
      where: { userId: id, providerId: "credential" },
    });
    expect(account.password).not.toBe(PASSWORD);
    expect(await verifyPassword({ hash: account.password ?? "", password: PASSWORD })).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: "created" },
    });
    expect(audit.actorId).toBe(admin.id);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await makeUser(admin, "requester", "dup@example.test");
    await expect(
      createUser(admin, {
        name: "Dup",
        email: "DUP@example.test",
        role: "requester",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ fieldErrors: { email: "email_taken" } });
  });

  it("validates input", async () => {
    await expect(
      createUser(admin, { name: "", email: "not-an-email", role: "boss", password: "short" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only lets admins manage users", async () => {
    const tech = await makeUser(admin, "technician");
    const requester = await makeUser(admin, "requester");
    for (const actor of [tech, requester]) {
      await expect(listUsers(actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        createUser(actor, {
          name: "X",
          email: "x@example.test",
          role: "admin",
          password: PASSWORD,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateUser(actor, actor.id, { role: "admin" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("stops an admin demoting or deactivating themselves", async () => {
    await expect(updateUser(admin, admin.id, { role: "technician" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(updateUser(admin, admin.id, { isActive: false })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("signs a user out everywhere when they are deactivated, and audits the change", async () => {
    const tech = await makeUser(admin, "technician");
    const prisma = getPrisma();
    await prisma.session.create({
      data: { userId: tech.id, token: "t1", expiresAt: new Date(Date.now() + 60_000) },
    });
    await updateUser(admin, tech.id, { isActive: false });

    expect(await prisma.session.count({ where: { userId: tech.id } })).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: tech.id, action: "updated" },
    });
    expect(audit.diff).toEqual({ isActive: { from: true, to: false } });
  });

  it("removes group memberships when a technician becomes a requester", async () => {
    const tech = await makeUser(admin, "technician");
    const prisma = getPrisma();
    const group = await prisma.group.findFirstOrThrow();
    await prisma.groupMember.create({ data: { groupId: group.id, userId: tech.id } });
    await updateUser(admin, tech.id, { role: "requester" });
    expect(await prisma.groupMember.count({ where: { userId: tech.id } })).toBe(0);
  });

  it("sets a new password and revokes sessions", async () => {
    const tech = await makeUser(admin, "technician");
    const prisma = getPrisma();
    await prisma.session.create({
      data: { userId: tech.id, token: "t2", expiresAt: new Date(Date.now() + 60_000) },
    });
    await setUserPassword(admin, tech.id, { password: "a brand new password" });
    const account = await prisma.account.findFirstOrThrow({ where: { userId: tech.id } });
    expect(
      await verifyPassword({ hash: account.password ?? "", password: "a brand new password" }),
    ).toBe(true);
    expect(await prisma.session.count({ where: { userId: tech.id } })).toBe(0);
  });

  it("resets two-factor enrollment", async () => {
    const tech = await makeUser(admin, "technician");
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: tech.id }, data: { twoFactorEnabled: true } });
    await prisma.twoFactor.create({ data: { userId: tech.id, secret: "s", backupCodes: "b" } });
    await resetUserTwoFactor(admin, tech.id);
    expect(await prisma.twoFactor.count({ where: { userId: tech.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: tech.id } })).twoFactorEnabled).toBe(
      false,
    );
  });
});
