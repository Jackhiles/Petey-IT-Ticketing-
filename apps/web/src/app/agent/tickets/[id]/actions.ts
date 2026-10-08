"use server";

import {
  addWatcher,
  deleteTimeEntry,
  linkTickets,
  logTime,
  mergeTickets,
  removeWatcher,
  renderCannedResponse,
  runMacro,
  setTicketTags,
  splitMessage,
  unlinkTickets,
} from "@petey/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

// Sidebar and message actions on the ticket page. Each applies the agent area guard;
// packages/core checks the permission again.

function refresh(ticketId: string): void {
  revalidatePath(`/agent/tickets/${ticketId}`);
  revalidatePath("/agent");
}

export async function setTagsAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const tagIds = form.getAll("tagIds").filter((v): v is string => typeof v === "string");
  const state = await runAction(
    () => setTicketTags(actor, ticketId, tagIds),
    getMessages().common.saved,
  );
  refresh(ticketId);
  return state;
}

export async function addWatcherAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(() => addWatcher(actor, ticketId, { email: field(form, "email") }));
  refresh(ticketId);
  return state;
}

export async function removeWatcherAction(ticketId: string, watcherId: string): Promise<void> {
  const actor = await requireArea("agent");
  await removeWatcher(actor, ticketId, watcherId);
  refresh(ticketId);
}

export async function linkAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(() =>
    linkTickets(actor, ticketId, { other: field(form, "other"), kind: field(form, "kind") }),
  );
  refresh(ticketId);
  return state;
}

export async function unlinkAction(ticketId: string, linkId: string): Promise<void> {
  const actor = await requireArea("agent");
  await unlinkTickets(actor, ticketId, linkId);
  refresh(ticketId);
}

export async function mergeAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  let targetId = "";
  const state = await runAction(async () => {
    ({ targetId } = await mergeTickets(actor, ticketId, { into: field(form, "into") }));
  });
  if (!state.ok) return state;
  refresh(ticketId);
  redirect(`/agent/tickets/${targetId}`);
}

export async function splitAction(
  messageId: string,
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  let id = "";
  const state = await runAction(async () => {
    ({ id } = await splitMessage(actor, messageId, { subject: field(form, "subject") }));
  });
  if (!state.ok) return state;
  refresh(ticketId);
  redirect(`/agent/tickets/${id}`);
}

export async function logTimeAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(
    () => logTime(actor, ticketId, { minutes: field(form, "minutes"), note: field(form, "note") }),
    getMessages().common.saved,
  );
  refresh(ticketId);
  return state;
}

export async function deleteTimeAction(ticketId: string, entryId: string): Promise<void> {
  const actor = await requireArea("agent");
  await deleteTimeEntry(actor, entryId);
  refresh(ticketId);
}

export async function runMacroAction(
  ticketId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(() => runMacro(actor, field(form, "macroId"), ticketId));
  refresh(ticketId);
  return state.ok ? { ok: true, message: getMessages().productivity.macroApplied } : state;
}

/** The canned response with this ticket's values filled in, for the reply editor. */
export async function renderCannedAction(
  cannedId: string,
  ticketId: string,
): Promise<string | null> {
  const actor = await requireArea("agent");
  try {
    return await renderCannedResponse(actor, cannedId, ticketId);
  } catch {
    return null;
  }
}
