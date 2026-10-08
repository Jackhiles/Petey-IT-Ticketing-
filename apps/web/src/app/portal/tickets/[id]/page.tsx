import { attachmentMaxBytes, getTicket, NotFoundError, type TicketAttachment } from "@petey/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/badges";
import { formatCustomValue } from "@/components/custom-field-inputs";
import { RelativeTime } from "@/components/relative-time";
import { SafeHtml } from "@/components/safe-html";
import { buttonClass, Card, cn } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { markResolvedAction, portalReplyAction, reopenAction } from "../../actions";
import { PortalReplyForm, StatusButton } from "./portal-forms";

function Files({ files }: { files: TicketAttachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/api/attachments/${f.id}`}
            className="inline-flex max-w-full items-center gap-1 truncate rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            📎 {f.filename}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireArea("portal");
  const t = getMessages().portal;
  const { id } = await params;
  // Core returns only the requester's own tickets and their public messages; anything
  // else is "not found", so the page can't reveal that another ticket exists.
  const ticket = await getTicket(actor, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (ticket.requester.id !== actor.id) notFound();

  const open = ticket.status.type === "open" || ticket.status.type === "on_hold";
  const resolved = ticket.status.type === "resolved";
  const closed = ticket.status.type === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-zinc-500 hover:underline">
          ← {t.backToList}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span data-testid="ticket-number">{ticket.displayNumber}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t.raised} <RelativeTime date={ticket.createdAt} />
        </p>
      </div>

      {resolved && (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          <p>{t.resolvedNotice}</p>
          <StatusButton action={reopenAction.bind(null, ticket.id)} label={t.reopen} />
        </div>
      )}
      {closed && (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p>{t.closedNotice}</p>
          <Link
            href={`/portal/tickets/new?followUp=${ticket.id}`}
            className={buttonClass("secondary")}
          >
            {t.raiseFollowUp}
          </Link>
        </div>
      )}

      <Card className="p-4 sm:p-6">
        <SafeHtml html={ticket.descriptionHtml} />
        <Files files={ticket.attachments.filter((a) => a.messageId === null)} />
        {(ticket.category || ticket.customFields.length > 0) && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
            {ticket.category && (
              <>
                <dt className="text-zinc-500">{t.category}</dt>
                <dd>
                  {ticket.category.parentName
                    ? `${ticket.category.parentName} › ${ticket.category.name}`
                    : ticket.category.name}
                </dd>
              </>
            )}
            {ticket.customFields.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-zinc-500">{f.label}</dt>
                <dd className="break-words">{formatCustomValue(f.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <section aria-labelledby="conversation">
        <h2 id="conversation" className="mb-3 text-lg font-medium">
          {t.conversation}
        </h2>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.noReplies}</p>
        ) : (
          <ol className="space-y-3" data-testid="portal-conversation">
            {ticket.messages.map((m) => {
              const mine = m.author?.id === actor.id;
              return (
                <li
                  key={m.id}
                  data-testid="portal-message"
                  className={cn(
                    "rounded-xl border p-4",
                    mine
                      ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      : "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {mine ? t.you : `${m.author?.name ?? t.supportTeam}`}
                    </span>
                    {!mine && <span className="text-xs text-zinc-500">{t.supportTeam}</span>}
                    <span className="text-zinc-500">
                      <RelativeTime date={m.createdAt} />
                    </span>
                  </div>
                  <SafeHtml html={m.bodyHtml} />
                  <Files files={m.attachments} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {!closed && (
        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-medium">{t.reply}</h2>
          {resolved && <p className="mb-3 text-sm text-zinc-500">{t.replyReopens}</p>}
          <PortalReplyForm
            action={portalReplyAction.bind(null, ticket.id)}
            maxMb={Math.round(attachmentMaxBytes() / (1024 * 1024))}
          />
        </Card>
      )}

      {open && (
        <StatusButton
          action={markResolvedAction.bind(null, ticket.id)}
          label={t.markResolved}
          confirm={t.markResolvedConfirm}
        />
      )}
    </div>
  );
}
