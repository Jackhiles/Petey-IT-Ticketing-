"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { getMessages } from "@/messages";
import { Button } from "./ui";

export function SignOutButton() {
  const router = useRouter();
  const t = getMessages();
  return (
    <Button
      variant="ghost"
      className="px-2"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
      }}
    >
      {t.nav.signOut}
    </Button>
  );
}
