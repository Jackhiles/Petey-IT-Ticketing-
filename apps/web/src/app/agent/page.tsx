import { PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export default async function AgentHome() {
  await requireArea("agent");
  const t = getMessages();
  return (
    <>
      <PageHeader title={t.agent.title} />
      <p className="text-zinc-600 dark:text-zinc-400">{t.agent.intro}</p>
    </>
  );
}
