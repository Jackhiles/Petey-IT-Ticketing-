"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

export function SignInForm() {
  const router = useRouter();
  const t = getMessages();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (signInError || !data) {
      setPending(false);
      setError(signInError?.status === 429 ? t.signIn.tooMany : t.signIn.failed);
      return;
    }
    // The root page picks the right home for this user's role.
    router.replace(
      "twoFactorRedirect" in data && data.twoFactorRedirect ? "/sign-in/two-factor" : "/",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field id="email" label={t.common.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field id="password" label={t.common.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.working : t.signIn.submit}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
        >
          {t.signIn.forgot}
        </Link>
      </p>
    </form>
  );
}
