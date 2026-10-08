"use server";

import {
  createCategory,
  createPriority,
  createStatus,
  deleteCategory,
  deletePriority,
  deleteStatus,
  updateCategory,
  updatePriority,
  updateStatus,
  updateTicketSettings,
} from "@petey/core";
import { revalidatePath } from "next/cache";
import { field, runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

// Each action applies the admin area guard; packages/core checks the permission again.

const statusInput = (form: FormData) => ({
  name: field(form, "name"),
  type: field(form, "type"),
  pausesSla: form.get("pausesSla") === "on",
  sortOrder: field(form, "sortOrder") || 0,
  isDefault: form.get("isDefault") === "on",
});

const priorityInput = (form: FormData) => ({
  name: field(form, "name"),
  level: field(form, "level"),
  color: field(form, "color"),
  isDefault: form.get("isDefault") === "on",
});

const categoryInput = (form: FormData) => ({
  name: field(form, "name"),
  parentId: field(form, "parentId"),
  sortOrder: field(form, "sortOrder") || 0,
});

/** Runs an admin change and refreshes the ticket admin pages and the agent workspace. */
async function adminChange(path: string, fn: () => Promise<unknown>): Promise<ActionState> {
  await requireArea("admin");
  const state = await runAction(fn, getMessages().common.saved);
  revalidatePath(path);
  revalidatePath("/agent", "layout");
  return state;
}

export async function createStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/statuses", () => createStatus(actor, statusInput(form)));
}
export async function updateStatusAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/statuses", () => updateStatus(actor, id, statusInput(form)));
}
export async function deleteStatusAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/statuses", () => deleteStatus(actor, id));
}

export async function createPriorityAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/priorities", () => createPriority(actor, priorityInput(form)));
}
export async function updatePriorityAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/priorities", () => updatePriority(actor, id, priorityInput(form)));
}
export async function deletePriorityAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/priorities", () => deletePriority(actor, id));
}

export async function createCategoryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/categories", () => createCategory(actor, categoryInput(form)));
}
export async function updateCategoryAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/categories", () => updateCategory(actor, id, categoryInput(form)));
}
export async function deleteCategoryAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/categories", () => deleteCategory(actor, id));
}

export async function updateTicketSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return adminChange("/admin/settings/tickets", () =>
    updateTicketSettings(actor, { prefix: field(form, "prefix") }),
  );
}
