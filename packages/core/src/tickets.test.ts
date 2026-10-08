import { getPrisma } from "@petey/db";
import { beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
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

async function statusId(name: string): Promise<string> {
  return (await getPrisma().status.findUniqueOrThrow({ where: { name } })).id;
}
async function priorityId(name: string): Promise<string> {
  return (await getPrisma().priority.findUniqueOrThrow({ where: { name } })).id;
}

describe.skipIf(!hasDatabase)("tickets", () => {
  let admin: Actor;
  let tech: Actor;
  let requester: Actor;

  beforeEach(async () => {
    admin = await freshInstall();
    tech = await makeUser(admin, "technician");
    requester = await makeUser(admin, "requester");
  });

  const newTicket = (subject: string, extra: Record<string, unknown> = {}) =>
    createTicket(tech, {
      subject,
      descriptionHtml: "<p>Details</p>",
      requesterId: requester.id,
      ...extra,
    });

  describe("create", () => {
    it("numbers tickets sequentially and applies the default status and priority", async () => {
      const a = await newTicket("First");
      const b = await newTicket("Second");
      expect(b.number).toBe(a.number + 1);
      const t = await getTicket(tech, a.id);
      expect(t.status.name).toBe("Open");
      expect(t.priority.name).toBe("Medium");
      expect(t.displayNumber).toBe(`PTY-${a.number}`);
    });

    it("shows the admin-set prefix", async () => {
      const a = await newTicket("First");
      await updateTicketSettings(admin, { prefix: "IT-" });
      expect((await getTicket(tech, a.id)).displayNumber).toBe(`IT-${a.number}`);
    });

    it("sanitizes the description and keeps a plain-text copy", async () => {
      const { id } = await newTicket("XSS", {
        descriptionHtml: '<p onclick="steal()">Hello <script>alert(1)</script><b>world</b></p>',
      });
      const t = await getTicket(tech, id);
      expect(t.descriptionHtml).toBe("<p>Hello <b>world</b></p>");
      expect(t.descriptionText).toBe("Hello world");
    });

    it("validates input", async () => {
      await expect(newTicket("")).rejects.toBeInstanceOf(ValidationError);
      await expect(newTicket("x", { priorityId: "not-a-uuid" })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it("records a created entry in history", async () => {
      const { id } = await newTicket("History");
      const t = await getTicket(tech, id);
      expect(t.history.map((h) => h.action)).toEqual(["created"]);
      expect(t.history[0]?.actor?.id).toBe(tech.id);
    });
  });

  describe("field changes", () => {
    it("writes each change to history with readable names", async () => {
      const { id } = await newTicket("Change me");
      await updateTicket(tech, id, {
        priorityId: await priorityId("Urgent"),
        assigneeId: tech.id,
        statusId: await statusId("In progress"),
      });
      const t = await getTicket(tech, id);
      const updated = t.history.find((h) => h.action === "updated");
      expect(updated?.diff).toMatchObject({
        priority: { from: "Medium", to: "Urgent" },
        assignee: { from: null, to: "technician user" },
        status: { from: "Open", to: "In progress" },
      });
    });

    it("records nothing when nothing changed", async () => {
      const { id } = await newTicket("Same");
      await updateTicket(tech, id, { subject: "Same" });
      expect((await getTicket(tech, id)).history).toHaveLength(1);
    });

    it("stamps resolved and closed times, and clears them on reopen", async () => {
      const { id } = await newTicket("Lifecycle");
      await updateTicket(tech, id, { statusId: await statusId("Resolved") });
      let t = await getTicket(tech, id);
      expect(t.resolvedAt).toBeInstanceOf(Date);
      expect(t.closedAt).toBeNull();

      await updateTicket(tech, id, { statusId: await statusId("Closed") });
      t = await getTicket(tech, id);
      expect(t.closedAt).toBeInstanceOf(Date);
      expect(t.resolvedAt).toBeInstanceOf(Date);

      await updateTicket(tech, id, { statusId: await statusId("Open") });
      t = await getTicket(tech, id);
      expect(t.resolvedAt).toBeNull();
      expect(t.closedAt).toBeNull();
    });

    it("only assigns technicians and admins", async () => {
      const { id } = await newTicket("Assign");
      await expect(updateTicket(tech, id, { assigneeId: requester.id })).rejects.toMatchObject({
        fieldErrors: { assigneeId: "assignee_not_staff" },
      });
    });
  });

  describe("messages", () => {
    it("adds a public reply and an internal note, both sanitized", async () => {
      const { id } = await newTicket("Talk");
      await addMessage(tech, id, {
        bodyHtml: "<p>Hi<img src=x onerror=alert(1)></p>",
        isInternal: false,
      });
      await addMessage(tech, id, { bodyHtml: "<p>Note</p>", isInternal: true });
      const t = await getTicket(tech, id);
      expect(t.messages.map((m) => [m.bodyHtml, m.isInternal])).toEqual([
        ['<p>Hi<img src="x" /></p>', false],
        ["<p>Note</p>", true],
      ]);
    });

    it("rejects an empty message", async () => {
      const { id } = await newTicket("Empty");
      await expect(
        addMessage(tech, id, { bodyHtml: "<p> </p>", isInternal: false }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("can set the status in the same step as a reply", async () => {
      const { id } = await newTicket("Reply and resolve");
      await addMessage(tech, id, {
        bodyHtml: "<p>Fixed</p>",
        isInternal: false,
        statusId: await statusId("Resolved"),
      });
      const t = await getTicket(tech, id);
      expect(t.status.name).toBe("Resolved");
      expect(t.history.map((h) => h.action)).toEqual(["created", "replied", "updated"]);
    });

    it("rejects an attachment over the size limit", async () => {
      const { id } = await newTicket("Big file");
      const big = {
        filename: "big.bin",
        mimeType: "application/octet-stream",
        data: new Uint8Array(26 * 1024 * 1024),
      };
      await expect(
        addMessage(tech, id, { bodyHtml: "<p>x</p>", isInternal: false, files: [big] }),
      ).rejects.toMatchObject({
        fieldErrors: { files: "file_too_large" },
      });
    });

    it("rejects files that together exceed the per-message limit", async () => {
      const { id } = await newTicket("Many files");
      const file = (n: number) => ({
        filename: `part${n}.bin`,
        mimeType: "application/octet-stream",
        data: new Uint8Array(20 * 1024 * 1024),
      });
      await expect(
        addMessage(tech, id, {
          bodyHtml: "<p>x</p>",
          isInternal: false,
          files: [file(1), file(2), file(3)],
        }),
      ).rejects.toMatchObject({ fieldErrors: { files: "files_too_large" } });
    });

    it("rejects executable attachments", async () => {
      const { id } = await newTicket("Exe");
      const exe = {
        filename: "setup.exe",
        mimeType: "application/octet-stream",
        data: new Uint8Array(4),
      };
      await expect(
        addMessage(tech, id, { bodyHtml: "<p>x</p>", isInternal: false, files: [exe] }),
      ).rejects.toMatchObject({
        fieldErrors: { files: "file_type_blocked" },
      });
    });
  });

  describe("list", () => {
    it("searches subject, description and message text, and finds by number", async () => {
      const printer = await newTicket("Printer on floor 3 jams", {
        descriptionHtml: "<p>Paper everywhere</p>",
      });
      const vpn = await newTicket("Cannot connect", {
        descriptionHtml: "<p>Working from home</p>",
      });
      await addMessage(tech, vpn.id, {
        bodyHtml: "<p>Reinstalled the VPN client</p>",
        isInternal: false,
      });

      const ids = async (q: string) => (await listTickets(tech, { q })).items.map((t) => t.id);
      expect(await ids("printer")).toEqual([printer.id]);
      expect(await ids("paper")).toEqual([printer.id]);
      expect(await ids("vpn")).toEqual([vpn.id]);
      expect(await ids("reinstall")).toEqual([vpn.id]); // stemming
      expect(await ids(`PTY-${vpn.number}`)).toEqual([vpn.id]);
      expect(await ids(String(printer.number))).toEqual([printer.id]);
      expect(await ids("nothing matches this")).toEqual([]);
    });

    it("filters by status type, assignee and priority", async () => {
      const mine = await newTicket("Mine", {
        assigneeId: tech.id,
        priorityId: await priorityId("High"),
      });
      const open = await newTicket("Unassigned");
      const done = await newTicket("Done");
      await updateTicket(tech, done.id, { statusId: await statusId("Closed") });

      const ids = async (q: Record<string, unknown>) =>
        (await listTickets(tech, q)).items.map((t) => t.id).sort();
      expect(await ids({ statusType: "open,on_hold" })).toEqual([mine.id, open.id].sort());
      expect(await ids({ statusType: ["closed"] })).toEqual([done.id]);
      expect(await ids({ assignee: "me" })).toEqual([mine.id]);
      expect(await ids({ assignee: "unassigned", statusType: "open" })).toEqual([open.id]);
      expect(await ids({ priority: await priorityId("High") })).toEqual([mine.id]);
    });

    it("sorts by priority then pages", async () => {
      for (const p of ["Low", "Urgent", "Medium"])
        await newTicket(p, { priorityId: await priorityId(p) });
      const sorted = await listTickets(tech, { sort: "priority", dir: "desc" });
      expect(sorted.items.map((t) => t.subject)).toEqual(["Urgent", "Medium", "Low"]);

      const page2 = await listTickets(tech, {
        sort: "priority",
        dir: "desc",
        pageSize: 2,
        page: 2,
      });
      expect(page2.total).toBe(3);
      expect(page2.items.map((t) => t.subject)).toEqual(["Low"]);
    });

    it("rejects an unknown sort", async () => {
      await expect(listTickets(tech, { sort: "drop table" })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("bulk", () => {
    it("assigns and closes several tickets, with history on each", async () => {
      const a = await newTicket("A");
      const b = await newTicket("B");
      const result = await bulkUpdateTickets(tech, {
        ids: [a.id, b.id],
        assigneeId: tech.id,
        close: true,
      });
      expect(result.updated).toBe(2);
      for (const id of [a.id, b.id]) {
        const t = await getTicket(tech, id);
        expect(t.assignee?.id).toBe(tech.id);
        expect(t.status.type).toBe("closed");
        expect(t.history.map((h) => h.action)).toEqual(["created", "updated"]);
      }
    });
  });
});
