import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireArea } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireArea("admin");
  return <AppShell user={user}>{children}</AppShell>;
}
