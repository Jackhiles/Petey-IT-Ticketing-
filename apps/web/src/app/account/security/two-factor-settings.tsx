"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";

type Step =
  | { kind: "idle" }
  | { kind: "password"; mode: "enable" | "disable" }
  | { kind: "verify"; qr: string; secret: string; backupCodes: string[] };

export function TwoFactorSettings({
  enabled,
  canDisable,
}: {
  enabled: boolean;
  canDisable: boolean;
}) {
  const router = useRouter();
  const t = getMessages();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>, mode: "enable" | "disable") {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    if (mode === "disable") {
      const { error: disableError } = await authClient.twoFactor.disable({ password });
      setPending(false);
      if (disableError) return setError(t.account.wrongPassword);
      setStep({ kind: "idle" });
      router.refresh();
      return;
    }
    const { data, error: enableError } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (enableError || !data || !("totpURI" in data)) return setError(t.account.wrongPassword);
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 });
    setStep({ kind: "verify", qr, secret, backupCodes: data.backupCodes });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (verifyError) return setError(t.signIn.codeFailed);
    // Back to the app: if two-factor was required, the area guard now lets them through.
    router.replace("/");
  }

  if (step.kind === "verify") {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t.account.scanQr}</p>
        {/* A data: URL generated in the browser, so next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={step.qr}
          alt={t.account.qrAlt}
          width={200}
          height={200}
          className="rounded bg-white p-2"
        />
        <p className="text-sm">
          {t.account.manualKey}{" "}
          <code
            data-testid="totp-secret"
            className="break-all rounded bg-zinc-100 px-1 dark:bg-zinc-800"
          >
            {step.secret}
          </code>
        </p>
        <div>
          <h3 className="text-sm font-medium">{t.account.recoveryCodesTitle}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.account.recoveryCodesIntro}</p>
          <ul
            data-testid="recovery-codes"
            className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm"
          >
            {step.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <form onSubmit={submitCode} className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field id="code" label={t.signIn.code}>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t.common.working : t.account.confirmCode}
          </Button>
        </form>
      </div>
    );
  }

  if (step.kind === "password") {
    return (
      <form onSubmit={(e) => submitPassword(e, step.mode)} className="space-y-3">
        <p className="text-sm">{t.account.twoFactorConfirmPassword}</p>
        {error && <Alert>{error}</Alert>}
        <Field id="tf-password" label={t.common.password}>
          <Input
            id="tf-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={step.mode === "disable" ? "danger" : "primary"}
            disabled={pending}
          >
            {pending
              ? t.common.working
              : step.mode === "disable"
                ? t.account.disable
                : t.account.twoFactorStart}
          </Button>
          <Button variant="secondary" onClick={() => setStep({ kind: "idle" })}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm">
        <Badge tone={enabled ? "success" : "warning"}>
          {enabled ? t.common.active : t.common.inactive}
        </Badge>
        {enabled ? t.account.twoFactorOn : t.account.twoFactorOff}
      </p>
      {!enabled && (
        <Button onClick={() => setStep({ kind: "password", mode: "enable" })}>
          {t.account.twoFactorStart}
        </Button>
      )}
      {enabled && canDisable && (
        <Button variant="secondary" onClick={() => setStep({ kind: "password", mode: "disable" })}>
          {t.account.disable}
        </Button>
      )}
    </div>
  );
}
