import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "./errors";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import {
  createCategory,
  createPriority,
  createStatus,
  deleteCategory,
  deletePriority,
  deleteStatus,
  listCategories,
  listPriorities,
  listStatuses,
  updateCategory,
  updateStatus,
} from "./ticket-config";
import { createTicket } from "./tickets";
import type { Actor } from "./permissions";

describe.skipIf(!hasDatabase)("ticket configuration", () => {
  let admin: Actor;
  beforeEach(async () => {
    admin = await freshInstall();
  });

  it("seeds statuses, priorities and two-level categories", async () => {
    expect((await listStatuses()).map((s) => s.name)).toEqual([
      "Open",
      "In progress",
      "On hold",
      "Resolved",
      "Closed",
    ]);
    expect((await listPriorities()).map((p) => p.name)).toEqual([
      "Low",
      "Medium",
      "High",
      "Urgent",
    ]);
    const hardware = (await listCategories()).find((c) => c.name === "Hardware");
    expect(hardware?.children.map((c) => c.name)).toEqual([
      "Laptop",
      "Desktop",
      "Printer",
      "Peripherals",
    ]);
  });

  it("is admin-only to change", async () => {
    const tech = await makeUser(admin, "technician");
    await expect(createStatus(tech, { name: "X", type: "open" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createPriority(tech, { name: "X", level: 9, color: "#000000" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createCategory(tech, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  describe("statuses", () => {
    it("keeps exactly one default, which must be an open status", async () => {
      const id = await createStatus(admin, { name: "Triage", type: "open", isDefault: true });
      expect((await listStatuses()).filter((s) => s.isDefault).map((s) => s.id)).toEqual([id]);

      const closed = (await listStatuses()).find((s) => s.name === "Closed");
      await expect(
        updateStatus(admin, closed?.id ?? "", { name: "Closed", type: "closed", isDefault: true }),
      ).rejects.toMatchObject({ message: "default_must_be_open" });
    });

    it("cannot delete the default, the last closed status, or one in use", async () => {
      const statuses = await listStatuses();
      const byName = (n: string) => statuses.find((s) => s.name === n)?.id ?? "";
      await expect(deleteStatus(admin, byName("Open"))).rejects.toBeInstanceOf(ConflictError);
      await expect(deleteStatus(admin, byName("Closed"))).rejects.toMatchObject({
        message: "need_closed_status",
      });

      await createTicket(admin, { subject: "Uses In progress", descriptionHtml: "" });
      await updateStatus(admin, byName("In progress"), {
        name: "In progress",
        type: "open",
        isDefault: true,
      });
      await createTicket(admin, { subject: "x", descriptionHtml: "" });
      await expect(deleteStatus(admin, byName("Open"))).rejects.toMatchObject({
        message: "in_use",
      });

      await deleteStatus(admin, byName("On hold"));
      expect((await listStatuses()).map((s) => s.name)).not.toContain("On hold");
    });

    it("rejects a duplicate name", async () => {
      await expect(createStatus(admin, { name: "Open", type: "open" })).rejects.toMatchObject({
        fieldErrors: { name: "name_taken" },
      });
    });
  });

  describe("priorities", () => {
    it("cannot delete the default or one in use", async () => {
      const priorities = await listPriorities();
      const medium = priorities.find((p) => p.name === "Medium")?.id ?? "";
      const low = priorities.find((p) => p.name === "Low")?.id ?? "";
      await expect(deletePriority(admin, medium)).rejects.toMatchObject({
        message: "need_one_default",
      });
      await createTicket(admin, { subject: "x", descriptionHtml: "", priorityId: low });
      await expect(deletePriority(admin, low)).rejects.toMatchObject({ message: "in_use" });
    });

    it("validates the colour", async () => {
      await expect(
        createPriority(admin, { name: "P", level: 5, color: "red" }),
      ).rejects.toMatchObject({
        fieldErrors: { color: "invalid_color" },
      });
    });
  });

  describe("categories", () => {
    it("allows only two levels", async () => {
      const top = await createCategory(admin, { name: "Phones" });
      const sub = await createCategory(admin, { name: "Mobile", parentId: top });
      await expect(createCategory(admin, { name: "Deeper", parentId: sub })).rejects.toMatchObject({
        message: "too_deep",
      });
      const hardware = (await listCategories()).find((c) => c.name === "Hardware");
      await expect(
        updateCategory(admin, top, { name: "Phones", parentId: hardware?.id }),
      ).rejects.toMatchObject({
        message: "has_children",
      });
    });

    it("keeps top-level names unique regardless of case", async () => {
      await expect(createCategory(admin, { name: "hardware" })).rejects.toMatchObject({
        message: "name_taken",
      });
    });

    it("cannot delete a category with subcategories or tickets", async () => {
      const hardware = (await listCategories()).find((c) => c.name === "Hardware");
      await expect(deleteCategory(admin, hardware?.id ?? "")).rejects.toMatchObject({
        message: "has_children",
      });
      const laptop = hardware?.children[0]?.id ?? "";
      await createTicket(admin, { subject: "x", descriptionHtml: "", categoryId: laptop });
      await expect(deleteCategory(admin, laptop)).rejects.toMatchObject({ message: "in_use" });
    });
  });
});
