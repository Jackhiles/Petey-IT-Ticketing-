"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

export function TwoFactorForm() {
  const router = useRouter();
  const t = getMessages();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { error: verifyError } = useRecovery
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (verifyError) {
      setPending(false);
      setError(verifyError.status === 429 ? t.signIn.tooMany : t.signIn.codeFailed);
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {useRecovery ? t.signIn.recoveryIntro : t.signIn.twoFactorIntro}
      </p>
      {error && <Alert>{error}</Alert>}
      <Field id="code" label={useRecovery ? t.signIn.recoveryCode : t.signIn.code}>
        <Input
          key={useRecovery ? "recovery" : "totp"}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          {...(useRecovery
            ? {}
            : { inputMode: "numeric" as const, pattern: "[0-9]{6}", maxLength: 6 })}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.working : t.signIn.verify}
      </Button>
      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError(null);
          }}
        >
          {useRecovery ? t.signIn.useApp : t.signIn.useRecovery}
        </button>
        <Link
          href="/sign-in"
          className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
        >
          {t.signIn.startOver}
        </Link>
      </div>
    </form>
  );
}
