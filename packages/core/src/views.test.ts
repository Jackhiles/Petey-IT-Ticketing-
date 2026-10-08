import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { freshInstall, hasDatabase, makeUser } from "./test-support";
import { createSavedView, deleteSavedView, listSavedViews } from "./views";
import type { Actor } from "./permissions";

describe.skipIf(!hasDatabase)("saved views", () => {
  let admin: Actor;
  let tess: Actor;
  let tom: Actor;
  beforeEach(async () => {
    admin = await freshInstall();
    tess = await makeUser(admin, "technician", "tess@example.test");
    tom = await makeUser(admin, "technician", "tom@example.test");
  });

  it("shows your own views and everyone's shared ones, but not others' private ones", async () => {
    await createSavedView(tess, { name: "My open", query: { assignee: "me", statusType: "open" } });
    await createSavedView(tom, { name: "Tom's private", query: {} });
    await createSavedView(tom, {
      name: "Team urgent",
      visibility: "shared",
      query: { sort: "priority" },
    });

    expect((await listSavedViews(tess)).map((v) => v.name)).toEqual(["My open", "Team urgent"]);
  });

  it("drops paging and empty values when saving", async () => {
    await createSavedView(tess, { name: "V", query: { page: "3", q: "", sort: "created" } });
    expect((await listSavedViews(tess))[0]?.query).toEqual({ sort: "created" });
  });

  it("refuses a query that would not load", async () => {
    await expect(
      createSavedView(tess, { name: "Bad", query: { sort: "nonsense" } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lets owners delete their views, admins delete shared ones, and nobody else", async () => {
    const mine = await createSavedView(tess, { name: "Mine", query: {} });
    const shared = await createSavedView(tess, { name: "Shared", visibility: "shared", query: {} });
    await expect(deleteSavedView(tom, mine)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSavedView(tom, shared)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteSavedView(admin, shared);
    await deleteSavedView(tess, mine);
    expect(await listSavedViews(tess)).toEqual([]);
  });

  it("is for staff only", async () => {
    const requester = await makeUser(admin, "requester");
    await expect(listSavedViews(requester)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
