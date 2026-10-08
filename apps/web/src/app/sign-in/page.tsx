import { needsSetup } from "@petey/core";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser, homePathFor } from "@/lib/session";
import { getMessages } from "@/messages";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await needsSetup()) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));
  const t = getMessages();
  return (
    <AuthCard title={t.signIn.title}>
      <SignInForm />
    </AuthCard>
  );
}
