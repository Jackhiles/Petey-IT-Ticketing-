import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export default async function AdminHome() {
  await requireArea("admin");
  const t = getMessages();
  const cards = [
    { href: "/admin/users", title: t.admin.usersCard, body: t.admin.usersCardBody },
    { href: "/admin/groups", title: t.admin.groupsCard, body: t.admin.groupsCardBody },
    { href: "/admin/statuses", title: t.admin.statusesCard, body: t.admin.statusesCardBody },
    { href: "/admin/priorities", title: t.admin.prioritiesCard, body: t.admin.prioritiesCardBody },
    { href: "/admin/categories", title: t.admin.categoriesCard, body: t.admin.categoriesCardBody },
    {
      href: "/admin/settings/tickets",
      title: t.admin.ticketSettingsCard,
      body: t.admin.ticketSettingsCardBody,
    },
    {
      href: "/admin/settings/security",
      title: t.admin.securityCard,
      body: t.admin.securityCardBody,
    },
  ];
  return (
    <>
      <PageHeader title={t.admin.title} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block rounded-xl focus-visible:outline-2">
            <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
              <h2 className="font-medium">{c.title}</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{c.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
