"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { initialState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { updateSecurityAction } from "./actions";

export function SecurityForm({ values }: { values: { requireTwoFactor: boolean } }) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(updateSecurityAction, initialState);
  return (
    <form action={formAction} className="space-y-4">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{errorMessage(state.error)}</Alert>}
      <div>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="requireTwoFactor"
            defaultChecked={values.requireTwoFactor}
            className="mt-0.5 size-4"
          />
          {t.security.requireTwoFactor}
        </label>
        <p className="mt-1 pl-6 text-sm text-zinc-500">{t.security.requireTwoFactorHint}</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t.common.working : t.common.save}
      </Button>
    </form>
  );
}
