// Phase 3: the requester portal at the service level. Requesters raise and follow tickets
// without ever seeing internal notes or anyone else's tickets.
import { getPrisma } from "@petey/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createCustomField, updateCustomField } from "./custom-fields";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { listMyTickets, markOwnTicketResolved, reopenOwnTicket } from "./portal";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import { updateTicketSettings } from "./ticket-settings";
import { addMessage, createTicket, getTicket, updateTicket } from "./tickets";
import type { Actor } from "./permissions";

const statusId = async (name: string) =>
  (await getPrisma().status.findUniqueOrThrow({ where: { name } })).id;
const categoryId = async (name: string) =>
  (await getPrisma().category.findFirstOrThrow({ where: { name } })).id;

describe.skipIf(!hasDatabase)("requester portal", () => {
  let admin: Actor;
  let tech: Actor;
  let alice: Actor;
  let bob: Actor;

  beforeEach(async () => {
    admin = await freshInstall();
    tech = await makeUser(admin, "technician");
    alice = await makeUser(admin, "requester", "alice@example.test");
    bob = await makeUser(admin, "requester", "bob@example.test");
  });

  const raise = async (actor: Actor, subject: string, extra: Record<string, unknown> = {}) =>
    createTicket(actor, {
      subject,
      descriptionHtml: `<p>${subject} details</p>`,
      categoryId: await categoryId("Laptop"),
      ...extra,
    });

  describe("raising a ticket", () => {
    it("requires a description and a category, reporting both at once", async () => {
      await expect(
        createTicket(alice, { subject: "Help", descriptionHtml: "<p> </p>" }),
      ).rejects.toMatchObject({
        fieldErrors: { descriptionHtml: "required", categoryId: "required" },
      });
    });

    it("doesn't require a category when the admin turns that off", async () => {
      await updateTicketSettings(admin, { prefix: "PTY-", requireCategoryOnPortal: false });
      await expect(
        createTicket(alice, { subject: "Help", descriptionHtml: "<p>Hi</p>" }),
      ).resolves.toBeTruthy();
    });

    it("stores attachments on the ticket itself", async () => {
      const { id } = await createTicket(
        alice,
        {
          subject: "With file",
          descriptionHtml: "<p>See file</p>",
          categoryId: await categoryId("Laptop"),
        },
        [{ filename: "error.png", mimeType: "image/png", data: new Uint8Array([1, 2, 3]) }],
      );
      const t = await getTicket(alice, id);
      expect(t.attachments.map((a) => [a.filename, a.messageId])).toEqual([["error.png", null]]);
      expect(t.source).toBe("portal");
    });
  });

  describe("custom fields", () => {
    beforeEach(async () => {
      await createCustomField(admin, {
        key: "asset_tag",
        label: "Asset tag",
        fieldType: "text",
        required: true,
      });
      await createCustomField(admin, {
        key: "office",
        label: "Office",
        fieldType: "select",
        options: ["London", "Leeds"],
      });
      await createCustomField(admin, {
        key: "cost_code",
        label: "Cost code",
        fieldType: "text",
        required: true,
        visibleToRequesters: false,
      });
    });

    it("are required on the portal when marked required, but technician-only ones are not asked", async () => {
      await expect(raise(alice, "No tag")).rejects.toMatchObject({
        fieldErrors: { "custom.asset_tag": "required" },
      });
      const { id } = await raise(alice, "Tagged", {
        customFields: { asset_tag: "LT-7", office: "Leeds" },
      });
      const seen = await getTicket(alice, id);
      expect(seen.customFields.map((f) => [f.label, f.value])).toEqual([
        ["Asset tag", "LT-7"],
        ["Office", "Leeds"],
      ]);
    });

    it("can't be set by requesters when technician-only", async () => {
      const { id } = await raise(alice, "Sneaky", {
        customFields: { asset_tag: "A", cost_code: "FREE" },
      });
      const staffView = await getTicket(tech, id);
      expect(staffView.customFields.find((f) => f.key === "cost_code")?.value).toBeNull();
    });

    it("are edited by technicians, with history, without forcing required fields", async () => {
      const { id } = await raise(alice, "Edit me", { customFields: { asset_tag: "A" } });
      await updateTicket(tech, id, { customFields: { office: "London", cost_code: "" } });
      const t = await getTicket(tech, id);
      expect(t.customFields.find((f) => f.key === "office")?.value).toBe("London");
      expect(t.history.find((h) => h.action === "updated")?.diff).toEqual({
        Office: { from: null, to: "London" },
      });
    });

    it("stop being asked for once deactivated", async () => {
      const field = (
        await getPrisma().customFieldDef.findUniqueOrThrow({ where: { key: "asset_tag" } })
      ).id;
      await updateCustomField(admin, field, {
        label: "Asset tag",
        isActive: false,
        required: true,
      });
      await expect(raise(alice, "No tag needed")).resolves.toBeTruthy();
    });

    it("validate their definitions", async () => {
      await expect(
        createCustomField(admin, { key: "Bad Key", label: "x", fieldType: "text" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        createCustomField(admin, {
          key: "choice",
          label: "Choice",
          fieldType: "select",
          options: [],
        }),
      ).rejects.toMatchObject({ fieldErrors: { options: "options_required" } });
      await expect(
        createCustomField(admin, { key: "asset_tag", label: "Again", fieldType: "text" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        createCustomField(tech, { key: "nope", label: "x", fieldType: "text" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  describe("my tickets", () => {
    it("lists only the requester's own tickets, split into open and done", async () => {
      const mine = await raise(alice, "Mine open");
      const done = await raise(alice, "Mine done");
      await raise(bob, "Bob's");
      await updateTicket(tech, done.id, { statusId: await statusId("Resolved") });

      expect((await listMyTickets(alice, {})).map((t) => t.id)).toEqual([mine.id]);
      expect((await listMyTickets(alice, { view: "done" })).map((t) => t.id)).toEqual([done.id]);
      expect((await listMyTickets(alice, { view: "all" })).map((t) => t.subject).sort()).toEqual([
        "Mine done",
        "Mine open",
      ]);
    });

    it("searches public text but never internal notes", async () => {
      const t = await raise(alice, "Printer");
      await addMessage(tech, t.id, {
        bodyHtml: "<p>Ordered toner cartridge</p>",
        isInternal: false,
      });
      await addMessage(tech, t.id, { bodyHtml: "<p>Requester is difficult</p>", isInternal: true });
      expect(await listMyTickets(alice, { q: "toner" })).toHaveLength(1);
      expect(await listMyTickets(alice, { q: "difficult" })).toHaveLength(0);
      expect(await listMyTickets(bob, { q: "toner" })).toHaveLength(0);
    });

    it("flags tickets waiting on the requester", async () => {
      const t = await raise(alice, "Question");
      expect((await listMyTickets(alice, {}))[0]?.awaitingRequester).toBe(false);
      await addMessage(tech, t.id, { bodyHtml: "<p>Which floor?</p>", isInternal: false });
      expect((await listMyTickets(alice, {}))[0]?.awaitingRequester).toBe(true);
      await addMessage(tech, t.id, { bodyHtml: "<p>Note</p>", isInternal: true });
      await addMessage(alice, t.id, { bodyHtml: "<p>Third</p>", isInternal: false });
      expect((await listMyTickets(alice, {}))[0]?.awaitingRequester).toBe(false);
    });
  });

  describe("resolving and reopening", () => {
    it("lets the requester mark their ticket resolved, then reopen it", async () => {
      const t = await raise(alice, "Fixed itself");
      await markOwnTicketResolved(alice, t.id);
      expect((await getTicket(alice, t.id)).status.type).toBe("resolved");
      await expect(markOwnTicketResolved(alice, t.id)).rejects.toBeInstanceOf(ConflictError);

      await reopenOwnTicket(alice, t.id);
      expect((await getTicket(alice, t.id)).status.name).toBe("Open");
      await expect(reopenOwnTicket(alice, t.id)).rejects.toMatchObject({ message: "not_resolved" });
    });

    it("reopens a resolved ticket when the requester replies", async () => {
      const t = await raise(alice, "Came back");
      await updateTicket(tech, t.id, { statusId: await statusId("Resolved") });
      await addMessage(alice, t.id, { bodyHtml: "<p>It's broken again</p>", isInternal: false });
      const after = await getTicket(tech, t.id);
      expect(after.status.name).toBe("Open");
      expect(after.history.at(-1)?.diff).toMatchObject({
        status: { from: "Resolved", to: "Open" },
      });
    });

    it("treats closed tickets as final", async () => {
      const t = await raise(alice, "Old");
      await updateTicket(tech, t.id, { statusId: await statusId("Closed") });
      await expect(reopenOwnTicket(alice, t.id)).rejects.toMatchObject({
        message: "ticket_closed",
      });
      await expect(
        addMessage(alice, t.id, { bodyHtml: "<p>Hello?</p>", isInternal: false }),
      ).rejects.toMatchObject({ message: "ticket_closed" });
      // Technicians can still add to a closed ticket.
      await addMessage(tech, t.id, { bodyHtml: "<p>Archived</p>", isInternal: true });
    });

    it("can't touch someone else's ticket", async () => {
      const t = await raise(bob, "Bob's");
      await expect(markOwnTicketResolved(alice, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(reopenOwnTicket(alice, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(markOwnTicketResolved(alice, "not-a-uuid")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
