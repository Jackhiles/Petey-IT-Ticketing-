import { listMyTickets } from "@petey/core";
import Link from "next/link";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/badges";
import { Button, buttonClass, cn, Input, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

const VIEWS = ["open", "done", "all"] as const;

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const actor = await requireArea("portal");
  const t = getMessages().portal;
  const params = await searchParams;
  const view = VIEWS.find((v) => v === params.view) ?? "open";
  const q = (params.q ?? "").trim();
  const tickets = await listMyTickets(actor, { view, q });

  return (
    <>
      <PageHeader
        title={t.title}
        actions={
          <Link href="/portal/tickets/new" className={buttonClass()}>
            {t.newTicket}
          </Link>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-zinc-500">{t.intro}</p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={t.title}
          className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900"
        >
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={`/portal?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={v === view ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5",
                v === view
                  ? "bg-white font-medium shadow-sm dark:bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400",
              )}
            >
              {t.views[v]}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          <input type="hidden" name="view" value={view} />
          <Input
            name="q"
            defaultValue={q}
            placeholder={t.search}
            aria-label={t.search}
            className="sm:w-64"
          />
          <Button type="submit" variant="secondary">
            {getMessages().common.search}
          </Button>
        </form>
      </div>

      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {q ? t.noMatches : t.noTickets}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="my-tickets">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/portal/tickets/${ticket.id}`}
                data-testid="my-ticket"
                className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium">{ticket.subject}</span>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                  <span>{ticket.displayNumber}</span>
                  <span>
                    {t.updated} <RelativeTime date={ticket.updatedAt} />
                  </span>
                  {ticket.awaitingRequester && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {t.awaitingYou}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
