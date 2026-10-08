"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = getMessages();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "failed">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    const { error } = await authClient.resetPassword({
      newPassword: String(new FormData(event.currentTarget).get("password") ?? ""),
      token,
    });
    setStatus(error ? "failed" : "done");
  }

  if (status === "done") {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t.passwordReset.resetDone}</Alert>
        <Link href="/sign-in" className="block text-center text-sm underline">
          {t.passwordReset.backToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status === "failed" && <Alert>{t.passwordReset.resetFailed}</Alert>}
      <Field id="password" label={t.passwordReset.newPassword} hint={t.errors.password_too_short}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={status === "pending"}>
        {status === "pending" ? t.common.working : t.passwordReset.resetSubmit}
      </Button>
    </form>
  );
}
