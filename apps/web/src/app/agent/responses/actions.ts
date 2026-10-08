"use server";

import {
  createCannedResponse,
  createMacro,
  deleteCannedResponse,
  deleteMacro,
  updateCannedResponse,
  type MacroAction,
} from "@petey/core";
import { revalidatePath } from "next/cache";
import { field, runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

// Each action applies the agent area guard; packages/core checks who may share what.

const sharing = (form: FormData) => ({
  visibility: field(form, "visibility") || "personal",
  sharedGroupId: field(form, "sharedGroupId"),
});

function refresh(): void {
  revalidatePath("/agent/responses");
  revalidatePath("/agent", "layout");
}

export async function createCannedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(
    () =>
      createCannedResponse(actor, {
        title: field(form, "title"),
        body: field(form, "body"),
        ...sharing(form),
      }),
    getMessages().common.saved,
  );
  refresh();
  return state;
}

export async function updateCannedAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("agent");
  const state = await runAction(
    () =>
      updateCannedResponse(actor, id, {
        title: field(form, "title"),
        body: field(form, "body"),
        ...sharing(form),
      }),
    getMessages().common.saved,
  );
  refresh();
  return state;
}

export async function deleteCannedAction(id: string): Promise<void> {
  const actor = await requireArea("agent");
  await deleteCannedResponse(actor, id);
  refresh();
}

/** Builds a macro's action list from the form's optional fields; blank fields are skipped. */
function macroActions(form: FormData): MacroAction[] {
  const actions: MacroAction[] = [];
  const reply = field(form, "replyBody");
  if (reply)
    actions.push({ type: "reply", bodyHtml: reply, internal: form.get("internal") === "on" });
  const statusId = field(form, "statusId");
  if (statusId) actions.push({ type: "set_status", statusId });
  const priorityId = field(form, "priorityId");
  if (priorityId) actions.push({ type: "set_priority", priorityId });
  const assign = field(form, "assign");
  if (assign) actions.push({ type: "assign", to: assign });
  const group = field(form, "groupId");
  if (group !== "keep") actions.push({ type: "set_group", groupId: group || null });
  const tagIds = (name: string) =>
    form.getAll(name).filter((v): v is string => typeof v === "string");
  if (tagIds("addTags").length) actions.push({ type: "add_tags", tagIds: tagIds("addTags") });
  if (tagIds("removeTags").length)
    actions.push({ type: "remove_tags", tagIds: tagIds("removeTags") });
  return actions;
}

export async function createMacroAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("agent");
  const actions = macroActions(form);
  if (actions.length === 0)
    return { error: "invalid", fieldErrors: { actions: "macro_needs_action" } };
  const state = await runAction(
    () => createMacro(actor, { name: field(form, "name"), actions, ...sharing(form) }),
    getMessages().common.saved,
  );
  refresh();
  return state;
}

export async function deleteMacroAction(id: string): Promise<void> {
  const actor = await requireArea("agent");
  await deleteMacro(actor, id);
  refresh();
}
