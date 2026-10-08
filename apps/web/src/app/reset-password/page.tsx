import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui";
import { getMessages } from "@/messages";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const t = getMessages();
  const { token, error } = await searchParams;
  return (
    <AuthCard title={t.passwordReset.resetTitle}>
      {error || !token ? (
        <Alert>{error ? t.passwordReset.resetFailed : t.passwordReset.missingToken}</Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthCard>
  );
}
