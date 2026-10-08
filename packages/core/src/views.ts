import { getPrisma, type Prisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor } from "./permissions";
import { ticketListQuerySchema } from "./tickets";
import { parse } from "./validation";

// Saved views store the list query as the user typed it (URL-style strings), so opening a
// view is the same as following its link. It is validated on save and again on use.

const queryInput = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const savedViewSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(100),
  visibility: z.enum(["private", "shared"]).default("private"),
  query: queryInput,
});

export interface SavedViewSummary {
  id: string;
  name: string;
  visibility: "private" | "shared";
  ownerId: string;
  ownerName: string;
  query: Record<string, string | string[]>;
}

/** Drops paging so a view always opens on its first page. */
function cleanQuery(query: Record<string, string | string[]>): Record<string, string | string[]> {
  const { page: _page, ...rest } = query;
  return Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

export async function listSavedViews(actor: Actor): Promise<SavedViewSummary[]> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  const rows = await getPrisma().savedView.findMany({
    where: { OR: [{ ownerId: actor.id }, { visibility: "shared" }] },
    orderBy: [{ visibility: "asc" }, { name: "asc" }],
    include: { owner: { select: { name: true } } },
  });
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    visibility: v.visibility,
    ownerId: v.ownerId,
    ownerName: v.owner.name,
    query: queryInput.catch({}).parse(v.query),
  }));
}

export async function createSavedView(actor: Actor, input: unknown): Promise<string> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  const data = parse(savedViewSchema, input);
  const query = cleanQuery(data.query);
  parse(ticketListQuerySchema, query); // reject a view that could never load

  return getPrisma().$transaction(async (tx) => {
    const view = await tx.savedView.create({
      data: {
        name: data.name,
        visibility: data.visibility,
        ownerId: actor.id,
        query: query as Prisma.InputJsonObject,
      },
    });
    await writeAudit(tx, {
      entityType: "saved_view",
      entityId: view.id,
      actorId: actor.id,
      action: "created",
      diff: { name: data.name, visibility: data.visibility },
    });
    return view.id;
  });
}

/** Owners delete their own views; admins can also delete shared ones. */
export async function deleteSavedView(actor: Actor, id: string): Promise<void> {
  if (!can(actor, "ticket.viewAll")) throw new ForbiddenError();
  await getPrisma().$transaction(async (tx) => {
    const view = await tx.savedView.findUnique({ where: { id } });
    if (!view || (view.ownerId !== actor.id && view.visibility === "private"))
      throw new NotFoundError();
    if (view.ownerId !== actor.id && actor.role !== "admin") throw new ForbiddenError();
    await tx.savedView.delete({ where: { id } });
    await writeAudit(tx, {
      entityType: "saved_view",
      entityId: id,
      actorId: actor.id,
      action: "deleted",
      diff: { name: view.name },
    });
  });
}
