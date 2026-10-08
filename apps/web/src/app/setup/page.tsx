import { needsSetup } from "@petey/core";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getMessages } from "@/messages";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/sign-in");
  const t = getMessages();
  return (
    <AuthCard title={t.setup.title} intro={t.setup.intro}>
      <SetupForm />
    </AuthCard>
  );
}
