"use server";

import { createUser, resetUserTwoFactor, setUserPassword, updateUser } from "@petey/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

// Each action applies the admin area guard (including any two-factor requirement);
// packages/core checks the permission again.

export async function createUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("admin");
  let id = "";
  const state = await runAction(async () => {
    id = await createUser(actor, {
      name: field(form, "name"),
      email: field(form, "email"),
      role: field(form, "role"),
      departmentId: field(form, "departmentId"),
      password: field(form, "password"),
    });
  });
  if (!state.ok) return state;
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?created=1`);
}

export async function updateUserAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  const state = await runAction(
    () =>
      updateUser(actor, id, {
        name: field(form, "name"),
        email: field(form, "email"),
        role: field(form, "role"),
        departmentId: field(form, "departmentId"),
        isActive: form.get("isActive") === "on",
      }),
    getMessages().common.saved,
  );
  revalidatePath("/admin/users");
  return state;
}

export async function setPasswordAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  return runAction(
    () => setUserPassword(actor, id, { password: field(form, "password") }),
    getMessages().users.passwordSet,
  );
}

export async function resetTwoFactorAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("admin");
  const state = await runAction(
    () => resetUserTwoFactor(actor, id),
    getMessages().users.twoFactorReset,
  );
  revalidatePath(`/admin/users/${id}`);
  return state;
}
