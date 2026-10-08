// Phase 2b: tags, watchers, links, merge and split, canned responses, macros, time tracking
// and collision detection.
import { getPrisma } from "@petey/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCannedResponse,
  deleteCannedResponse,
  listCannedResponses,
  renderCannedResponse,
} from "./canned-responses";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { addGroupMember } from "./groups";
import { createMacro, listMacros, runMacro } from "./macros";
import { heartbeat, PRESENCE_WINDOW_MS } from "./presence";
import { createTag, setTicketTags } from "./tags";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import { updateTicketSettings } from "./ticket-settings";
import { linkTickets, mergeTickets, splitMessage, unlinkTickets } from "./ticket-links";
import { addMessage, createTicket, getTicket, listTickets, updateTicket } from "./tickets";
import { deleteTimeEntry, logTime } from "./time-entries";
import { addWatcher, removeWatcher } from "./watchers";
import type { Actor } from "./permissions";

const id = async (model: "status" | "priority", name: string) =>
  model === "status"
    ? (await getPrisma().status.findUniqueOrThrow({ where: { name } })).id
    : (await getPrisma().priority.findUniqueOrThrow({ where: { name } })).id;

const file = (name: string) => ({
  filename: name,
  mimeType: "text/plain",
  data: new TextEncoder().encode(name),
});

describe.skipIf(!hasDatabase)("technician productivity", () => {
  let admin: Actor;
  let tess: Actor & { email: string };
  let tom: Actor & { email: string };
  let rex: Actor & { email: string };
  let rita: Actor & { email: string };

  beforeEach(async () => {
    admin = await freshInstall();
    tess = await makeUser(admin, "technician", "tess@example.test");
    tom = await makeUser(admin, "technician", "tom@example.test");
    rex = await makeUser(admin, "requester", "rex@example.test");
    rita = await makeUser(admin, "requester", "rita@example.test");
    // These tests are about privacy, not the portal form, so the category rule is off.
    await updateTicketSettings(admin, { prefix: "PTY-", requireCategoryOnPortal: false });
  });

  const ticketFor = (requester: Actor, subject: string, extra: Record<string, unknown> = {}) =>
    createTicket(tess, {
      subject,
      descriptionHtml: `<p>${subject} details</p>`,
      requesterId: requester.id,
      ...extra,
    });

  describe("tags", () => {
    it("are created by admins and applied by technicians, with history", async () => {
      await expect(createTag(tess, { name: "VIP", color: "#dc2626" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      const vip = await createTag(admin, { name: "VIP", color: "#dc2626" });
      const hw = await createTag(admin, { name: "Hardware swap", color: "#2563eb" });
      const t = await ticketFor(rex, "Tagged");

      await setTicketTags(tess, t.id, [vip, hw]);
      await setTicketTags(tess, t.id, [hw]);
      const detail = await getTicket(tess, t.id);
      expect(detail.tags.map((x) => x.name)).toEqual(["Hardware swap"]);
      const [first, second] = detail.history
        .filter((h) => h.action === "tagged")
        .map((h) => h.diff as { added: string[]; removed: string[] });
      expect([...(first?.added ?? [])].sort()).toEqual(["Hardware swap", "VIP"]);
      expect(first?.removed).toEqual([]);
      expect(second).toEqual({ added: [], removed: ["VIP"] });
    });

    it("filter the ticket list", async () => {
      const vip = await createTag(admin, { name: "VIP", color: "#dc2626" });
      const a = await ticketFor(rex, "A");
      await ticketFor(rex, "B");
      await setTicketTags(tess, a.id, [vip]);
      const { items } = await listTickets(tess, { tag: vip });
      expect(items.map((t) => t.subject)).toEqual(["A"]);
      expect(items[0]?.tags.map((x) => x.name)).toEqual(["VIP"]);
    });

    it("are hidden from requesters", async () => {
      const vip = await createTag(admin, { name: "VIP", color: "#dc2626" });
      const t = await createTicket(rex, { subject: "Mine", descriptionHtml: "<p>Details</p>" });
      await setTicketTags(tess, t.id, [vip]);
      expect((await getTicket(rex, t.id)).tags).toEqual([]);
    });
  });

  describe("watchers", () => {
    it("are added by address, linked to users when they exist, and never duplicated", async () => {
      const t = await ticketFor(rex, "Watched");
      await addWatcher(tess, t.id, { email: "Rita@Example.test" });
      await addWatcher(tess, t.id, { email: "rita@example.test" });
      await addWatcher(tess, t.id, { email: "boss@outside.example" });
      const { watchers } = await getTicket(tess, t.id);
      expect(watchers.map((w) => [w.email, w.user?.id ?? null])).toEqual([
        ["boss@outside.example", null],
        ["rita@example.test", rita.id],
      ]);
      await removeWatcher(tess, t.id, watchers[0]?.id ?? "");
      expect((await getTicket(tess, t.id)).watchers).toHaveLength(1);
    });

    it("can't be the requester, and are hidden from requesters", async () => {
      const t = await createTicket(rex, { subject: "Mine", descriptionHtml: "<p>Details</p>" });
      await expect(addWatcher(tess, t.id, { email: rex.email })).rejects.toBeInstanceOf(
        ConflictError,
      );
      await addWatcher(tess, t.id, { email: "boss@outside.example" });
      expect((await getTicket(rex, t.id)).watchers).toEqual([]);
      await expect(addWatcher(rex, t.id, { email: "x@example.test" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("time tracking", () => {
    it("logs time on its own and with a reply, and totals it", async () => {
      const t = await ticketFor(rex, "Timed");
      await logTime(tess, t.id, { minutes: 30, note: "Diagnosis" });
      await addMessage(tess, t.id, { bodyHtml: "<p>Done</p>", isInternal: false, minutes: 15 });
      const detail = await getTicket(tess, t.id);
      expect(detail.totalMinutes).toBe(45);
      const withReply = detail.timeEntries.find((e) => e.minutes === 15);
      expect(withReply?.messageId).toBe(detail.messages[0]?.id);
    });

    it("validates minutes and lets only the author or an admin delete an entry", async () => {
      const t = await ticketFor(rex, "Timed");
      await expect(logTime(tess, t.id, { minutes: 0 })).rejects.toBeInstanceOf(ValidationError);
      await expect(logTime(tess, t.id, { minutes: 2000 })).rejects.toBeInstanceOf(ValidationError);
      const entry = await logTime(tess, t.id, { minutes: 10 });
      await expect(deleteTimeEntry(tom, entry)).rejects.toBeInstanceOf(ForbiddenError);
      await deleteTimeEntry(admin, entry);
      expect((await getTicket(tess, t.id)).totalMinutes).toBe(0);
    });

    it("is hidden from and unavailable to requesters", async () => {
      const t = await createTicket(rex, { subject: "Mine", descriptionHtml: "<p>Details</p>" });
      await logTime(tess, t.id, { minutes: 5 });
      expect((await getTicket(rex, t.id)).timeEntries).toEqual([]);
      await expect(logTime(rex, t.id, { minutes: 5 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        addMessage(rex, t.id, { bodyHtml: "<p>x</p>", isInternal: false, minutes: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("links", () => {
    it("link parent and child by number, shown from both ends", async () => {
      const parent = await ticketFor(rex, "Outage");
      const child = await ticketFor(rita, "Can't print");
      await linkTickets(tess, child.id, { other: `PTY-${parent.number}`, kind: "parent" });
      expect((await getTicket(tess, child.id)).links.map((l) => [l.kind, l.ticket.id])).toEqual([
        ["parent", parent.id],
      ]);
      expect((await getTicket(tess, parent.id)).links.map((l) => [l.kind, l.ticket.id])).toEqual([
        ["child", child.id],
      ]);
    });

    it("refuse self-links, duplicates and a second parent", async () => {
      const a = await ticketFor(rex, "A");
      const b = await ticketFor(rex, "B");
      const c = await ticketFor(rex, "C");
      await expect(
        linkTickets(tess, a.id, { other: String(a.number), kind: "related" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await linkTickets(tess, a.id, { other: String(b.number), kind: "related" });
      await expect(
        linkTickets(tess, b.id, { other: String(a.number), kind: "related" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await linkTickets(tess, c.id, { other: String(a.number), kind: "parent" });
      await expect(
        linkTickets(tess, c.id, { other: String(b.number), kind: "parent" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        linkTickets(tess, a.id, { other: "99999", kind: "related" }),
      ).rejects.toMatchObject({
        fieldErrors: { other: "ticket_not_found" },
      });
    });

    it("can be removed", async () => {
      const a = await ticketFor(rex, "A");
      const b = await ticketFor(rex, "B");
      const link = await linkTickets(tess, a.id, { other: String(b.number), kind: "related" });
      await unlinkTickets(tess, b.id, link);
      expect((await getTicket(tess, a.id)).links).toEqual([]);
    });

    it("close open children when the parent resolves, if asked", async () => {
      const parent = await ticketFor(rex, "Outage");
      const kid1 = await ticketFor(rita, "Kid 1");
      const kid2 = await ticketFor(rita, "Kid 2");
      await linkTickets(tess, parent.id, { other: String(kid1.number), kind: "child" });
      await linkTickets(tess, parent.id, { other: String(kid2.number), kind: "child" });

      await updateTicket(tess, parent.id, {
        statusId: await id("status", "In progress"),
        closeChildren: true,
      });
      expect((await getTicket(tess, kid1.id)).status.name).toBe("Open");

      await updateTicket(tess, parent.id, {
        statusId: await id("status", "Resolved"),
        closeChildren: true,
      });
      expect((await getTicket(tess, kid1.id)).status.type).toBe("closed");
      expect((await getTicket(tess, kid2.id)).status.type).toBe("closed");
    });

    it("are for staff only", async () => {
      const a = await createTicket(rex, { subject: "A", descriptionHtml: "<p>Details</p>" });
      const b = await createTicket(rex, { subject: "B", descriptionHtml: "<p>Details</p>" });
      await expect(
        linkTickets(rex, a.id, { other: String(b.number), kind: "related" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect((await getTicket(rex, a.id)).links).toEqual([]);
    });
  });

  describe("merge", () => {
    it("moves every message, attachment, watcher, tag and time entry, and closes the duplicate", async () => {
      const vip = await createTag(admin, { name: "VIP", color: "#dc2626" });
      const target = await ticketFor(rex, "Printer jammed");
      const source = await ticketFor(rita, "Printer still jammed", {
        descriptionHtml: "<p>Same printer, third floor</p>",
      });
      await addMessage(tess, source.id, {
        bodyHtml: "<p>Public on dup</p>",
        isInternal: false,
        files: [file("a.txt")],
      });
      await addMessage(tess, source.id, {
        bodyHtml: "<p>Note on dup</p>",
        isInternal: true,
        files: [file("b.txt")],
      });
      await addWatcher(tess, source.id, { email: "boss@outside.example" });
      await setTicketTags(tess, source.id, [vip]);
      await logTime(tess, source.id, { minutes: 20 });

      const { targetId } = await mergeTickets(tess, source.id, { into: `PTY-${target.number}` });
      expect(targetId).toBe(target.id);

      const merged = await getTicket(tess, target.id);
      expect(merged.messages.map((m) => m.bodyText)).toEqual([
        `Merged from PTY-${source.number}: Printer still jammed\nSame printer, third floor`,
        "Public on dup",
        "Note on dup",
      ]);
      expect(merged.messages[0]?.author?.id).toBe(rita.id);
      expect(merged.attachments.map((a) => a.filename).sort()).toEqual(["a.txt", "b.txt"]);
      expect(merged.watchers.map((w) => w.email).sort()).toEqual([
        "boss@outside.example",
        rita.email,
      ]);
      expect(merged.tags.map((t) => t.name)).toEqual(["VIP"]);
      expect(merged.totalMinutes).toBe(20);
      expect(merged.links.map((l) => [l.kind, l.ticket.id])).toEqual([["merged_from", source.id]]);

      const dup = await getTicket(tess, source.id);
      expect(dup.status.type).toBe("closed");
      expect(dup.messages).toEqual([]);
      expect(dup.links.map((l) => [l.kind, l.ticket.id])).toEqual([["merged_into", target.id]]);
    });

    it("makes the merged text searchable on the target", async () => {
      const target = await ticketFor(rex, "Printer jammed");
      const source = await ticketFor(rita, "Toner", {
        descriptionHtml: "<p>Magenta cartridge empty</p>",
      });
      await addMessage(tess, source.id, {
        bodyHtml: "<p>Ordered from Contoso</p>",
        isInternal: false,
      });
      await mergeTickets(tess, source.id, { into: String(target.number) });
      const ids = async (q: string) => (await listTickets(tess, { q })).items.map((t) => t.id);
      expect(await ids("magenta")).toContain(target.id);
      expect(await ids("contoso")).toEqual([target.id]);
    });

    it("keeps internal notes away from the target's requester", async () => {
      const target = await createTicket(rex, {
        subject: "Mine",
        descriptionHtml: "<p>Details</p>",
      });
      const source = await ticketFor(rita, "Dup");
      await addMessage(tess, source.id, {
        bodyHtml: "<p>Secret note</p>",
        isInternal: true,
        files: [file("secret.txt")],
      });
      await mergeTickets(tess, source.id, { into: String(target.number) });
      const seen = await getTicket(rex, target.id);
      expect(JSON.stringify(seen)).not.toContain("Secret note");
      expect(seen.attachments.map((a) => a.filename)).not.toContain("secret.txt");
    });

    it("refuses to merge a ticket into itself, twice, or into a merged ticket", async () => {
      const a = await ticketFor(rex, "A");
      const b = await ticketFor(rex, "B");
      const c = await ticketFor(rex, "C");
      await expect(mergeTickets(tess, a.id, { into: String(a.number) })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await mergeTickets(tess, a.id, { into: String(b.number) });
      await expect(mergeTickets(tess, a.id, { into: String(c.number) })).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(mergeTickets(tess, c.id, { into: String(a.number) })).rejects.toMatchObject({
        fieldErrors: { into: "target_merged" },
      });
    });
  });

  describe("split", () => {
    it("moves a message and its attachments into a new linked ticket for the same requester", async () => {
      const t = await ticketFor(rex, "Two problems");
      const msg = await addMessage(rex, t.id, {
        bodyHtml: "<p>Also, my monitor flickers</p>",
        isInternal: false,
        files: [file("photo.txt")],
      });
      const created = await splitMessage(tess, msg, { subject: "Monitor flickers" });

      const split = await getTicket(tess, created.id);
      expect(split.subject).toBe("Monitor flickers");
      expect(split.descriptionText).toBe("Also, my monitor flickers");
      expect(split.requester.id).toBe(rex.id);
      expect(split.attachments.map((a) => [a.filename, a.messageId])).toEqual([
        ["photo.txt", null],
      ]);
      expect(split.links.map((l) => [l.kind, l.ticket.id])).toEqual([["related", t.id]]);

      const original = await getTicket(tess, t.id);
      expect(original.messages).toEqual([]);
      expect(original.attachments).toEqual([]);
    });

    it("won't turn an internal note into a public description", async () => {
      const t = await ticketFor(rex, "T");
      const note = await addMessage(tess, t.id, { bodyHtml: "<p>Internal</p>", isInternal: true });
      await expect(splitMessage(tess, note, { subject: "x" })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe("canned responses", () => {
    it("fill variables for the ticket and the technician", async () => {
      const t = await ticketFor(rex, "Laptop <slow>");
      const id1 = await createCannedResponse(tess, {
        title: "Greeting",
        body: "<p>Hi {{requester.first_name}}, about {{ticket.number}} ({{ticket.subject}}). {{agent.first_name}}</p>",
      });
      expect(await renderCannedResponse(tess, id1, t.id)).toBe(
        `<p>Hi requester, about PTY-${t.number} (Laptop &lt;slow&gt;). technician</p>`,
      );
    });

    it("are personal unless an admin shares them with everyone or a group", async () => {
      const group = (await getPrisma().group.findFirstOrThrow({ where: { name: "Network" } })).id;
      await addGroupMember(admin, group, tom.id);
      await createCannedResponse(tess, { title: "Tess only", body: "<p>x</p>" });
      await expect(
        createCannedResponse(tess, { title: "Shared", body: "<p>x</p>", visibility: "all" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await createCannedResponse(admin, { title: "Everyone", body: "<p>x</p>", visibility: "all" });
      await createCannedResponse(admin, {
        title: "Network team",
        body: "<p>x</p>",
        visibility: "group",
        sharedGroupId: group,
      });

      const titles = async (a: Actor) => (await listCannedResponses(a)).map((c) => c.title);
      expect(await titles(tess)).toEqual(["Everyone", "Tess only"]);
      expect(await titles(tom)).toEqual(["Everyone", "Network team"]);
      expect(await listCannedResponses(tess, "tess")).toHaveLength(1);
    });

    it("can't be read or deleted by someone they aren't shared with", async () => {
      const mine = await createCannedResponse(tess, { title: "Mine", body: "<p>x</p>" });
      const t = await ticketFor(rex, "T");
      await expect(renderCannedResponse(tom, mine, t.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteCannedResponse(tom, mine)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listCannedResponses(rex)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("macros", () => {
    it("apply every action in one click, with the reply's variables filled", async () => {
      const vip = await createTag(admin, { name: "VIP", color: "#dc2626" });
      const t = await ticketFor(rex, "Reset my password");
      const macro = await createMacro(tess, {
        name: "Password reset done",
        actions: [
          {
            type: "reply",
            bodyHtml: "<p>Hi {{requester.first_name}}, your password is reset.</p>",
            internal: false,
          },
          { type: "set_status", statusId: await id("status", "Resolved") },
          { type: "set_priority", priorityId: await id("priority", "Low") },
          { type: "assign", to: "me" },
          { type: "add_tags", tagIds: [vip] },
        ],
      });
      expect((await listMacros(tess)).map((m) => m.name)).toEqual(["Password reset done"]);

      await runMacro(tess, macro, t.id);
      const done = await getTicket(tess, t.id);
      expect(done.messages.map((m) => m.bodyText)).toEqual([
        "Hi requester, your password is reset.",
      ]);
      expect(done.status.name).toBe("Resolved");
      expect(done.priority.name).toBe("Low");
      expect(done.assignee?.id).toBe(tess.id);
      expect(done.tags.map((x) => x.name)).toEqual(["VIP"]);
      expect(done.history.map((h) => h.action)).toEqual([
        "created",
        "macro_run",
        "replied",
        "updated",
        "tagged",
      ]);
    });

    it("change nothing if any action fails", async () => {
      const t = await ticketFor(rex, "Atomic");
      const macro = await createMacro(tess, {
        name: "Broken",
        actions: [
          { type: "reply", bodyHtml: "<p>Should not be sent</p>", internal: false },
          { type: "assign", to: rex.id }, // a requester can't be assigned
        ],
      });
      await expect(runMacro(tess, macro, t.id)).rejects.toBeInstanceOf(ValidationError);
      const after = await getTicket(tess, t.id);
      expect(after.messages).toEqual([]);
      expect(after.history.map((h) => h.action)).toEqual(["created"]);
    });

    it("reject unknown action types and are not usable by other technicians when personal", async () => {
      await expect(
        createMacro(tess, { name: "Bad", actions: [{ type: "delete_everything" }] }),
      ).rejects.toBeInstanceOf(ValidationError);
      const macro = await createMacro(tess, {
        name: "Mine",
        actions: [{ type: "assign", to: "me" }],
      });
      const t = await ticketFor(rex, "T");
      await expect(runMacro(tom, macro, t.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("collision detection", () => {
    it("shows other technicians viewing or typing, but not yourself or stale visits", async () => {
      const t = await ticketFor(rex, "Busy");
      const now = new Date();
      await heartbeat(tom, t.id, true, now);
      await heartbeat(admin, t.id, false, new Date(now.getTime() - PRESENCE_WINDOW_MS - 1000));
      const view = await heartbeat(tess, t.id, false, now);
      expect(view.viewers).toEqual([{ id: tom.id, name: "technician user", isTyping: true }]);
      await expect(heartbeat(rex, t.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("warns before posting if the ticket changed since it was opened", async () => {
      const t = await ticketFor(rex, "Changed");
      const opened = (await getTicket(tess, t.id)).updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      await addMessage(tom, t.id, { bodyHtml: "<p>Tom got there first</p>", isInternal: false });

      await expect(
        addMessage(tess, t.id, {
          bodyHtml: "<p>Me too</p>",
          isInternal: false,
          seenUpdatedAt: opened,
        }),
      ).rejects.toMatchObject({ message: "ticket_changed" });
      await addMessage(tess, t.id, {
        bodyHtml: "<p>Me too</p>",
        isInternal: false,
        seenUpdatedAt: opened,
        confirmStale: true,
      });
      expect((await getTicket(tess, t.id)).messages).toHaveLength(2);
    });
  });
});
