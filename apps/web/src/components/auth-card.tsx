import type { ReactNode } from "react";
import { getMessages } from "@/messages";
import { Card } from "./ui";

/** Centred card used by the setup, sign-in and password pages. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const t = getMessages();
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight">{t.app.name}</p>
        <Card>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {intro && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{intro}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </main>
  );
}
