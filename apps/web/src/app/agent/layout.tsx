import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireArea } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireArea("agent");
  return (
    <AppShell user={user} wide>
      {children}
    </AppShell>
  );
}
