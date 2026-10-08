import { getSecuritySettings } from "@petey/core";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { SecurityForm } from "./security-form";

export default async function SecuritySettingsPage() {
  await requireArea("admin");
  const t = getMessages();
  const settings = await getSecuritySettings();
  return (
    <>
      <PageHeader title={t.security.title} />
      <Card className="max-w-xl">
        <SecurityForm values={settings} />
      </Card>
    </>
  );
}
