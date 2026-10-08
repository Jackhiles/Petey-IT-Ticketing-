import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Account pages are open to every signed-in user, including staff who still have to
// enroll in two-factor, so this layout does not apply the area guard.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
