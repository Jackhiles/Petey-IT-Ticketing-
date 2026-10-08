"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

export default function ForgotPasswordPage() {
  const t = getMessages();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    // The response is the same whether or not the account exists, to avoid revealing users.
    await authClient.requestPasswordReset({
      email: String(new FormData(event.currentTarget).get("email") ?? ""),
      redirectTo: "/reset-password",
    });
    setPending(false);
    setSent(true);
  }

  return (
    <AuthCard title={t.passwordReset.forgotTitle} intro={t.passwordReset.forgotIntro}>
      {sent ? (
        <Alert tone="info">{t.passwordReset.forgotSent}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="email" label={t.common.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t.common.working : t.passwordReset.forgotSubmit}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link
          href="/sign-in"
          className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
        >
          {t.passwordReset.backToSignIn}
        </Link>
      </p>
    </AuthCard>
  );
}
