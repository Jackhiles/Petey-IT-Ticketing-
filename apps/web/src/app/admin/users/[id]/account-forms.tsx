"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

export function SetPasswordForm({
  action,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-3">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <Field
        id="new-password"
        label={t.passwordReset.newPassword}
        error={errorMessage(state.fieldErrors?.password)}
        hint={t.errors.password_too_short}
      >
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.common.working : t.users.setPassword}
      </Button>
    </form>
  );
}

export function ResetTwoFactorForm({
  action,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
}) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-3">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{errorMessage(state.error)}</Alert>}
      <Button type="submit" variant="danger" disabled={pending || state.ok}>
        {pending ? t.common.working : t.users.resetTwoFactor}
      </Button>
    </form>
  );
}
