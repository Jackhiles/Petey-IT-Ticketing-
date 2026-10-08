"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { initialState, type ActionState } from "@/lib/action-state";
import { errorMessage } from "@/messages/en";
import { getMessages } from "@/messages";
import { createFirstAdminAction } from "./actions";

export function SetupForm() {
  const router = useRouter();
  const t = getMessages();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createFirstAdminAction,
    initialState,
  );
  const credentials = useRef<{ email: string; password: string } | null>(null);

  // Once the admin exists, sign them straight in.
  useEffect(() => {
    if (!state.ok || !credentials.current) return;
    void authClient.signIn.email(credentials.current).then(() => router.replace("/admin"));
  }, [state.ok]);

  return (
    <form
      action={(form) => {
        credentials.current = {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        };
        action(form);
      }}
      className="space-y-4"
    >
      {state.error && !state.fieldErrors && <Alert>{errorMessage(state.error)}</Alert>}
      <Field id="name" label={t.common.name} error={errorMessage(state.fieldErrors?.name)}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field id="email" label={t.common.email} error={errorMessage(state.fieldErrors?.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        id="password"
        label={t.common.password}
        error={errorMessage(state.fieldErrors?.password)}
        hint={t.errors.password_too_short}
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending || state.ok}>
        {pending || state.ok ? t.common.working : t.setup.submit}
      </Button>
    </form>
  );
}
