// Requesters never see internal notes, other requesters' tickets, or technician-only fields
// (docs/PLAN.md, "Roles and permissions"). These cases pin that down in the core queries.
import { beforeEach, describe, expect, it } from "vitest";
import { getAttachment } from "./attachments";
import { ForbiddenError, NotFoundError } from "./errors";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import { updateTicketSettings } from "./ticket-settings";
import {
  addMessage,
  bulkUpdateTickets,
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
} from "./tickets";
import type { Actor } from "./permissions";

const file = (name: string) => ({
  filename: name,
  mimeType: "text/plain",
  data: new TextEncoder().encode(`contents of ${name}`),
});

describe.skipIf(!hasDatabase)("ticket visibility", () => {
  let admin: Actor;
  let tech: Actor;
  let alice: Actor;
  let bob: Actor;
  let aliceTicket: string;
  let bobTicket: string;
  let publicAttachment: string;
  let internalAttachment: string;

  beforeEach(async () => {
    admin = await freshInstall();
    tech = await makeUser(admin, "technician");
    alice = await makeUser(admin, "requester", "alice@example.test");
    bob = await makeUser(admin, "requester", "bob@example.test");
    // These tests are about privacy, not the portal form, so the category rule is off.
    await updateTicketSettings(admin, { prefix: "PTY-", requireCategoryOnPortal: false });

    aliceTicket = (
      await createTicket(alice, { subject: "Alice's laptop", descriptionHtml: "<p>Broken</p>" })
    ).id;
    bobTicket = (
      await createTicket(bob, { subject: "Bob's printer", descriptionHtml: "<p>Jammed</p>" })
    ).id;

    await addMessage(tech, aliceTicket, {
      bodyHtml: "<p>Public reply</p>",
      isInternal: false,
      files: [file("public.txt")],
    });
    await addMessage(tech, aliceTicket, {
      bodyHtml: "<p>Secret note: replace the whole machine</p>",
      isInternal: true,
      files: [file("internal.txt")],
    });

    const staffView = await getTicket(tech, aliceTicket);
    publicAttachment = staffView.attachments.find((a) => a.filename === "public.txt")?.id ?? "";
    internalAttachment = staffView.attachments.find((a) => a.filename === "internal.txt")?.id ?? "";
  });

  describe("a requester", () => {
    it("sees their own ticket", async () => {
      const t = await getTicket(alice, aliceTicket);
      expect(t.subject).toBe("Alice's laptop");
    });

    it("gets not-found, not forbidden, for someone else's ticket", async () => {
      await expect(getTicket(alice, bobTicket)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("never sees internal notes or their attachments", async () => {
      const t = await getTicket(alice, aliceTicket);
      expect(t.messages.map((m) => m.bodyText)).toEqual(["Public reply"]);
      expect(t.messages.every((m) => !m.isInternal)).toBe(true);
      expect(t.attachments.map((a) => a.filename)).toEqual(["public.txt"]);
      expect(JSON.stringify(t)).not.toContain("Secret note");
    });

    it("does not get the history, assignee or group", async () => {
      const t = await getTicket(alice, aliceTicket);
      expect(t.history).toEqual([]);
      expect(t.assignee).toBeNull();
      expect(t.group).toBeNull();
    });

    it("can download a public attachment on their ticket only", async () => {
      expect((await getAttachment(alice, publicAttachment)).filename).toBe("public.txt");
      await expect(getAttachment(alice, internalAttachment)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getAttachment(bob, publicAttachment)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("can reply publicly to their own ticket", async () => {
      await addMessage(alice, aliceTicket, { bodyHtml: "<p>Thanks</p>", isInternal: false });
      const t = await getTicket(alice, aliceTicket);
      expect(t.messages.map((m) => m.bodyText)).toContain("Thanks");
    });

    it("cannot add an internal note", async () => {
      await expect(
        addMessage(alice, aliceTicket, { bodyHtml: "<p>x</p>", isInternal: true }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("cannot change status while replying", async () => {
      const t = await getTicket(tech, aliceTicket);
      await expect(
        addMessage(alice, aliceTicket, {
          bodyHtml: "<p>x</p>",
          isInternal: false,
          statusId: t.status.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("cannot reply to someone else's ticket", async () => {
      await expect(
        addMessage(alice, bobTicket, { bodyHtml: "<p>x</p>", isInternal: false }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("cannot list, edit or bulk-edit tickets", async () => {
      await expect(listTickets(alice, {})).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateTicket(alice, aliceTicket, { subject: "x" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        bulkUpdateTickets(alice, { ids: [aliceTicket], assigneeId: alice.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("always becomes the requester of tickets they create, and cannot set staff fields", async () => {
      const own = await createTicket(alice, { subject: "Mine", descriptionHtml: "<p>Details</p>" });
      expect((await getTicket(admin, own.id)).requester.id).toBe(alice.id);
      await expect(
        createTicket(alice, {
          subject: "x",
          descriptionHtml: "<p>Details</p>",
          requesterId: bob.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        createTicket(alice, {
          subject: "x",
          descriptionHtml: "<p>Details</p>",
          assigneeId: tech.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("staff", () => {
    it("see every ticket, every internal note and every attachment", async () => {
      for (const actor of [tech, admin]) {
        const t = await getTicket(actor, aliceTicket);
        expect(t.messages).toHaveLength(2);
        expect(t.attachments).toHaveLength(2);
        expect((await getAttachment(actor, internalAttachment)).filename).toBe("internal.txt");
        await expect(getTicket(actor, bobTicket)).resolves.toBeTruthy();
      }
    });

    it("list all requesters' tickets", async () => {
      const { items } = await listTickets(tech, {});
      expect(items.map((t) => t.id).sort()).toEqual([aliceTicket, bobTicket].sort());
    });
  });

  it("denies a deactivated user everything", async () => {
    const inactive = { ...tech, isActive: false };
    await expect(getTicket(inactive, aliceTicket)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listTickets(inactive, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAttachment(inactive, publicAttachment)).rejects.toBeInstanceOf(NotFoundError);
  });
});
