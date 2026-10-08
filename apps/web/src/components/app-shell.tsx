import { can, type SessionUser } from "@petey/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { getMessages } from "@/messages";
import { SignOutButton } from "./sign-out-button";

/** Header and page frame for signed-in users. Links show only the areas the user can reach. */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = getMessages();
  const links = [
    { href: "/portal", label: t.nav.portal, show: can(user, "area.portal") },
    { href: "/agent", label: t.nav.agent, show: can(user, "area.agent") },
    { href: "/admin", label: t.nav.admin, show: can(user, "area.admin") },
    { href: "/account/security", label: t.nav.account, show: true },
  ].filter((l) => l.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            {t.app.name}
          </Link>
          <nav aria-label={t.nav.main} className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-zinc-500 sm:inline" data-testid="current-user">
              {user.name} · {t.roles[user.role]}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
