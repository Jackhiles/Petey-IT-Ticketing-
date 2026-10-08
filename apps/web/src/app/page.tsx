import { needsSetup } from "@petey/core";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sends visitors to first-run setup, sign-in, or their role's home. */
export default async function RootPage() {
  if (await needsSetup()) redirect("/setup");
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user.role) : "/sign-in");
}
