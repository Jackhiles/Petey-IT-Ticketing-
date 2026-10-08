"use server";

import {
  addMessage,
  bulkUpdateTickets,
  createSavedView,
  createTicket,
  deleteSavedView,
  updateTicket,
} from "@petey/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, runAction, uploads, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

// Each action applies the agent area guard; packages/core checks the permission again.

export async function createTicketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("agent");
  let id = "";
  const state = await runAction(async () => {
    ({ id } = await createTicket(actor, {
      subject: field(form, "subject"),
      descriptionHtml: field(form, "descriptionHtml"),
      type: field(form, "type") || undefined,
      priorityId: field(form, "priorityId") || undefined,
      categoryId: field(form, "categoryId"),
      requesterId: field(form, "requesterId") || undefined,
      assigneeId: field(form, "assigneeId"),
      groupId: field(form, "groupId"),
    }));
  });
  if (!state.ok) return state;
  revalidatePath("/agent");
  redirect(`/agent/tickets/${id}`);
}

export async function updateTicketAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(
    () =>
      updateTicket(actor, id, {
        subject: field(form, "subject"),
        type: field(form, "type"),
        statusId: field(form, "statusId"),
        priorityId: field(form, "priorityId"),
        categoryId: field(form, "categoryId"),
        assigneeId: field(form, "assigneeId"),
        groupId: field(form, "groupId"),
      }),
    getMessages().tickets.fieldsSaved,
  );
  revalidatePath(`/agent/tickets/${id}`);
  return state;
}

export async function addMessageAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const files = await uploads(form, "files");
  const state = await runAction(() =>
    addMessage(actor, id, {
      bodyHtml: field(form, "bodyHtml"),
      isInternal: field(form, "kind") === "note",
      statusId: field(form, "statusId") || undefined,
      files,
    }),
  );
  revalidatePath(`/agent/tickets/${id}`);
  return state;
}

export async function bulkUpdateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("agent");
  let updated = 0;
  const assignee = field(form, "assigneeId");
  const group = field(form, "groupId");
  const state = await runAction(async () => {
    ({ updated } = await bulkUpdateTickets(actor, {
      ids: form.getAll("ids").filter((v) => typeof v === "string"),
      // "keep" leaves the field alone; "" clears it.
      ...(assignee !== "keep" ? { assigneeId: assignee } : {}),
      ...(group !== "keep" ? { groupId: group } : {}),
      close: field(form, "intent") === "close",
    }));
  });
  revalidatePath("/agent");
  return state.ok ? { ok: true, message: getMessages().tickets.bulkDone(updated) } : state;
}

export async function saveViewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("agent");
  let query: unknown = {};
  try {
    query = JSON.parse(field(form, "query"));
  } catch {
    // An unreadable query fails validation in core.
  }
  let id = "";
  const state = await runAction(async () => {
    id = await createSavedView(actor, {
      name: field(form, "name"),
      visibility: form.get("shared") === "on" ? "shared" : "private",
      query,
    });
  });
  if (!state.ok) return state;
  revalidatePath("/agent");
  redirect(`/agent?view=${id}`);
}

export async function deleteViewAction(id: string): Promise<void> {
  const actor = await requireArea("agent");
  await deleteSavedView(actor, id);
  revalidatePath("/agent");
  redirect("/agent");
}
