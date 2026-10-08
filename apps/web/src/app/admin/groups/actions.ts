"use server";

import {
  addGroupMember,
  createGroup,
  deleteGroup,
  removeGroupMember,
  updateGroup,
} from "@petey/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export async function createGroupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("admin");
  let id = "";
  const state = await runAction(async () => {
    id = await createGroup(actor, {
      name: field(form, "name"),
      description: field(form, "description"),
    });
  });
  if (!state.ok) return state;
  revalidatePath("/admin/groups");
  redirect(`/admin/groups/${id}`);
}

export async function updateGroupAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  const state = await runAction(
    () =>
      updateGroup(actor, id, {
        name: field(form, "name"),
        description: field(form, "description"),
      }),
    getMessages().common.saved,
  );
  revalidatePath("/admin/groups");
  return state;
}

export async function addMemberAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  const state = await runAction(() => addGroupMember(actor, id, field(form, "userId")));
  revalidatePath(`/admin/groups/${id}`);
  return state;
}

export async function removeMemberAction(id: string, userId: string): Promise<void> {
  const actor = await requireArea("admin");
  await removeGroupMember(actor, id, userId);
  revalidatePath(`/admin/groups/${id}`);
}

export async function deleteGroupAction(id: string): Promise<void> {
  const actor = await requireArea("admin");
  await deleteGroup(actor, id);
  revalidatePath("/admin/groups");
  redirect("/admin/groups");
}
