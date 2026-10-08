import { PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export default async function PortalHome() {
  await requireArea("portal");
  const t = getMessages();
  return (
    <>
      <PageHeader title={t.portal.title} />
      <p className="text-zinc-600 dark:text-zinc-400">{t.portal.intro}</p>
    </>
  );
}
