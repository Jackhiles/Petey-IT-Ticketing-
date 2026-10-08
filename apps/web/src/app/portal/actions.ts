"use server";

import { addMessage, createTicket, markOwnTicketResolved, reopenOwnTicket } from "@petey/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customFieldValues, field, runAction, uploads, type ActionState } from "@/lib/actions";
import { requireArea } from "@/lib/session";

// Requester actions. Each applies the portal area guard; packages/core checks ownership.

export async function raiseTicketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireArea("portal");
  const files = await uploads(form, "files");
  let id = "";
  const state = await runAction(async () => {
    ({ id } = await createTicket(
      actor,
      {
        subject: field(form, "subject"),
        descriptionHtml: field(form, "descriptionHtml"),
        type: field(form, "type") || undefined,
        categoryId: field(form, "categoryId"),
        customFields: customFieldValues(form),
      },
      files,
    ));
  });
  if (!state.ok) return state;
  revalidatePath("/portal");
  redirect(`/portal/tickets/${id}`);
}

export async function portalReplyAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireArea("portal");
  const files = await uploads(form, "files");
  const state = await runAction(() =>
    addMessage(actor, id, { bodyHtml: field(form, "bodyHtml"), isInternal: false, files }),
  );
  revalidatePath(`/portal/tickets/${id}`);
  revalidatePath("/portal");
  return state;
}

export async function markResolvedAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("portal");
  const state = await runAction(() => markOwnTicketResolved(actor, id));
  revalidatePath(`/portal/tickets/${id}`);
  revalidatePath("/portal");
  return state;
}

export async function reopenAction(id: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireArea("portal");
  const state = await runAction(() => reopenOwnTicket(actor, id));
  revalidatePath(`/portal/tickets/${id}`);
  revalidatePath("/portal");
  return state;
}
