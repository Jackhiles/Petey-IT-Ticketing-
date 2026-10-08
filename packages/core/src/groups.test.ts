import { getPrisma } from "@petey/db";
import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "./errors";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
} from "./groups";
import { getSecuritySettings, mustEnrollTwoFactor, updateSecuritySettings } from "./settings";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import type { Actor } from "./permissions";

describe.skipIf(!hasDatabase)("groups service", () => {
  let admin: Actor;
  beforeEach(async () => {
    admin = await freshInstall();
  });

  it("lists the seeded groups", async () => {
    const names = (await listGroups(admin)).map((g) => g.name);
    expect(names).toEqual(["Hardware", "Network", "Service Desk"]);
  });

  it("creates, renames and deletes a group with audit rows", async () => {
    const id = await createGroup(admin, { name: "Security", description: "" });
    await updateGroup(admin, id, { name: "Security Ops", description: "SOC" });
    expect(await getGroup(admin, id)).toMatchObject({ name: "Security Ops", description: "SOC" });
    await deleteGroup(admin, id);
    const actions = (
      await getPrisma().auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(["created", "updated", "deleted"]);
  });

  it("rejects a duplicate group name", async () => {
    await expect(createGroup(admin, { name: "Network" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("adds technicians but not requesters as members", async () => {
    const group = (await listGroups(admin))[0];
    if (!group) throw new Error("seeded groups missing");
    const tech = await makeUser(admin, "technician");
    const requester = await makeUser(admin, "requester");
    await addGroupMember(admin, group.id, tech.id);
    await addGroupMember(admin, group.id, tech.id); // idempotent
    await expect(addGroupMember(admin, group.id, requester.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await getGroup(admin, group.id)).members.map((m) => m.id)).toEqual([tech.id]);

    await removeGroupMember(admin, group.id, tech.id);
    expect((await getGroup(admin, group.id)).members).toEqual([]);
  });

  it("is admin-only", async () => {
    const tech = await makeUser(admin, "technician");
    await expect(listGroups(tech)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createGroup(tech, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!hasDatabase)("security settings", () => {
  let admin: Actor;
  beforeEach(async () => {
    admin = await freshInstall();
  });

  it("defaults to not requiring two-factor, and admins can turn it on", async () => {
    expect(await getSecuritySettings()).toEqual({ requireTwoFactor: false });
    await updateSecuritySettings(admin, { requireTwoFactor: true });
    expect(await getSecuritySettings()).toEqual({ requireTwoFactor: true });
  });

  it("is admin-only", async () => {
    const tech = await makeUser(admin, "technician");
    await expect(updateSecuritySettings(tech, { requireTwoFactor: true })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requires enrollment only for staff without two-factor when the setting is on", () => {
    const on = { requireTwoFactor: true };
    const off = { requireTwoFactor: false };
    expect(mustEnrollTwoFactor({ role: "technician", twoFactorEnabled: false }, on)).toBe(true);
    expect(mustEnrollTwoFactor({ role: "admin", twoFactorEnabled: false }, on)).toBe(true);
    expect(mustEnrollTwoFactor({ role: "technician", twoFactorEnabled: true }, on)).toBe(false);
    expect(mustEnrollTwoFactor({ role: "requester", twoFactorEnabled: false }, on)).toBe(false);
    expect(mustEnrollTwoFactor({ role: "admin", twoFactorEnabled: false }, off)).toBe(false);
  });
});
