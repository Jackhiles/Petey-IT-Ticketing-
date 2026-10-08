"use server";

import { createFirstAdmin } from "@petey/core";
import { field, runAction, type ActionState } from "@/lib/actions";

export async function createFirstAdminAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(() =>
    createFirstAdmin({
      name: field(form, "name"),
      email: field(form, "email"),
      password: field(form, "password"),
    }),
  );
}
