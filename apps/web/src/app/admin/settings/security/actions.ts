"use server";

import { updateSecuritySettings } from "@petey/core";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export async function updateSecurityAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("admin");
  const state = await runAction(
    () =>
      updateSecuritySettings(actor, { requireTwoFactor: form.get("requireTwoFactor") === "on" }),
    getMessages().common.saved,
  );
  revalidatePath("/", "layout");
  return state;
}
