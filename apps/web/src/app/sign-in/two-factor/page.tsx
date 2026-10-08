import { AuthCard } from "@/components/auth-card";
import { getMessages } from "@/messages";
import { TwoFactorForm } from "./two-factor-form";

export default function TwoFactorPage() {
  const t = getMessages();
  return (
    <AuthCard title={t.signIn.twoFactorTitle}>
      <TwoFactorForm />
    </AuthCard>
  );
}
