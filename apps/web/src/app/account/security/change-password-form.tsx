"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

export function ChangePasswordForm() {
  const t = getMessages();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "failed">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setStatus("pending");
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      revokeOtherSessions: true,
    });
    if (!error) formEl.reset();
    setStatus(error ? "failed" : "done");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status === "done" && <Alert tone="success">{t.account.passwordChanged}</Alert>}
      {status === "failed" && <Alert>{t.account.passwordChangeFailed}</Alert>}
      <Field id="currentPassword" label={t.account.currentPassword}>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field id="newPassword" label={t.account.newPassword} hint={t.errors.password_too_short}>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <Button type="submit" disabled={status === "pending"}>
        {status === "pending" ? t.common.working : t.account.changePassword}
      </Button>
    </form>
  );
}
