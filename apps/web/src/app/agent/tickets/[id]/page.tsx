import {
  attachmentMaxBytes,
  getTicket,
  listAssignees,
  listCategories,
  listGroupOptions,
  listPriorities,
  listCannedResponses,
  listMacros,
  listStatuses,
  listTags,
  NotFoundError,
  type TicketAttachment,
  type TicketHistoryEntry,
  type TicketMessageView,
} from "@petey/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SafeHtml } from "@/components/safe-html";
import { Badge, Card, cn } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { PriorityBadge, StatusBadge } from "../badges";
import { RelativeTime } from "../relative-time";
import { addMessageAction, updateTicketAction } from "../actions";
import {
  addWatcherAction,
  deleteTimeAction,
  linkAction,
  logTimeAction,
  mergeAction,
  removeWatcherAction,
  runMacroAction,
  setTagsAction,
  splitAction,
  unlinkAction,
} from "./actions";
import { PresenceBar } from "./presence-bar";
import { ReplyForm } from "./reply-form";
import { TicketFieldsForm } from "./ticket-fields-form";
import {
  LinksPanel,
  MacrosPanel,
  MergePanel,
  SplitForm,
  TagChips,
  TagsPanel,
  TimePanel,
  WatchersPanel,
} from "./ticket-panels";

type TimelineItem =
  | { kind: "message"; at: Date; message: TicketMessageView }
  | { kind: "event"; at: Date; entry: TicketHistoryEntry };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentLinks({ files }: { files: TicketAttachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/api/attachments/${f.id}`}
            className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            📎 {f.filename} <span className="text-zinc-500">({formatSize(f.size)})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function HistoryLine({ entry }: { entry: TicketHistoryEntry }) {
  const t = getMessages().tickets;
  const who = entry.actor?.name ?? t.system;
  const labels: Record<string, string> = {
    subject: t.subject,
    type: t.type,
    status: t.status,
    priority: t.priority,
    category: t.category,
    requester: t.requester,
    assignee: t.assignee,
    group: t.group,
  };
  const show = (v: unknown) => {
    if (v === null || v === undefined || v === "") return t.emptyValue;
    if (v === "incident" || v === "request") return t.types[v];
    return String(v);
  };
  const changes =
    entry.action === "updated" && entry.diff && typeof entry.diff === "object"
      ? Object.entries(entry.diff as Record<string, { from: unknown; to: unknown }>).map(
          ([field, c]) => t.historyChange(labels[field] ?? field, show(c.from), show(c.to)),
        )
      : [];
  const p = getMessages().productivity;
  const d = (entry.diff ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as string[]).join(", ") : "");
  const kind = (k: string) => p.linkKinds[k as keyof typeof p.linkKinds] ?? k;
  const described: Record<string, () => string> = {
    created: () => t.historyCreated,
    updated: () => `${t.historyUpdated} ${changes.join("; ")}`,
    tagged: () => p.history.tagged(list("added"), list("removed")),
    linked: () => p.history.linked(kind(str("kind")).toLowerCase(), str("ticket")),
    unlinked: () => p.history.unlinked,
    merged_into: () => p.history.mergedInto(str("ticket")),
    merged_from: () => p.history.mergedFrom(str("ticket")),
    split: () => p.history.split(str("ticket")),
    time_logged: () => p.history.timeLogged(formatMinutes(Number(d.minutes) || 0)),
    time_deleted: () => p.history.timeDeleted(formatMinutes(Number(d.minutes) || 0)),
    macro_run: () => p.history.macroRun(str("macro")),
    watcher_added: () => p.history.watcherAdded(str("email")),
    watcher_removed: () => p.history.watcherRemoved(str("email")),
  };
  return (
    <li className="flex gap-2 py-1 text-xs text-zinc-500" data-testid="history-entry">
      <span aria-hidden>•</span>
      <span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{who}</span>{" "}
        {described[entry.action]?.() ?? entry.action} · <RelativeTime date={entry.createdAt} />
      </span>
    </li>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireArea("agent");
  const t = getMessages().tickets;
  const { id } = await params;

  const ticket = await getTicket(actor, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [statuses, priorities, categories, assignees, groups, tags, canned, macros] =
    await Promise.all([
      listStatuses(),
      listPriorities(),
      listCategories(),
      listAssignees(actor),
      listGroupOptions(actor),
      listTags(),
      listCannedResponses(actor),
      listMacros(actor),
    ]);
  const mergedAway = ticket.links.some((l) => l.kind === "merged_into");
  const hasChildren = ticket.links.some((l) => l.kind === "child");
  const byId = <T extends { id: string }>(items: T[], make: (item: T) => () => Promise<void>) =>
    Object.fromEntries(items.map((item) => [item.id, make(item)]));

  // Messages and field changes in one timeline; replies and notes already show as messages.
  const timeline: TimelineItem[] = [
    ...ticket.messages.map((message) => ({
      kind: "message" as const,
      at: message.createdAt,
      message,
    })),
    ...ticket.history
      // Replies and notes already appear as messages.
      .filter((entry) => entry.action !== "replied" && entry.action !== "noted")
      .map((entry) => ({ kind: "event" as const, at: entry.createdAt, entry })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const ticketFiles = ticket.attachments.filter((a) => a.messageId === null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link href="/agent" className="text-sm text-zinc-500 hover:underline">
            ← {getMessages().agent.title}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <span data-testid="ticket-number">{ticket.displayNumber}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          {ticket.tags.length > 0 && (
            <div className="mt-2">
              <TagChips tags={ticket.tags} />
            </div>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {ticket.requester.name} &lt;{ticket.requester.email}&gt; · {t.created}{" "}
            <RelativeTime date={ticket.createdAt} />
          </p>
        </div>

        <PresenceBar ticketId={ticket.id} seenUpdatedAt={ticket.updatedAt.toISOString()} />

        <Card>
          <h2 className="sr-only">{t.description}</h2>
          {ticket.descriptionHtml ? (
            <SafeHtml html={ticket.descriptionHtml} />
          ) : (
            <p className="text-sm text-zinc-500">—</p>
          )}
          <AttachmentLinks files={ticketFiles} />
        </Card>

        <section aria-labelledby="conversation-heading">
          <h2 id="conversation-heading" className="mb-3 text-lg font-medium">
            {t.conversation}
          </h2>
          <ol className="space-y-3" data-testid="timeline">
            {timeline.map((item) =>
              item.kind === "event" ? (
                <HistoryLine key={item.entry.id} entry={item.entry} />
              ) : (
                <li
                  key={item.message.id}
                  data-testid={item.message.isInternal ? "internal-note" : "public-reply"}
                  className={cn(
                    "rounded-xl border p-4",
                    item.message.isInternal
                      ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {item.message.author?.name ?? t.unknownUser}
                    </span>
                    {item.message.isInternal && <Badge tone="warning">{t.internalBadge}</Badge>}
                    <span className="text-zinc-500">
                      <RelativeTime date={item.message.createdAt} />
                    </span>
                  </div>
                  <SafeHtml html={item.message.bodyHtml} />
                  <AttachmentLinks files={item.message.attachments} />
                  {!item.message.isInternal && !mergedAway && (
                    <SplitForm action={splitAction.bind(null, item.message.id, ticket.id)} />
                  )}
                </li>
              ),
            )}
          </ol>
          {ticket.messages.length === 0 && (
            <p className="mt-2 text-sm text-zinc-500">{t.noMessages}</p>
          )}
        </section>

        <Card>
          <ReplyForm
            action={addMessageAction.bind(null, ticket.id)}
            ticketId={ticket.id}
            statuses={statuses}
            maxMb={Math.round(attachmentMaxBytes() / (1024 * 1024))}
            seenUpdatedAt={ticket.updatedAt.toISOString()}
            canned={canned.map((c) => ({
              id: c.id,
              title: c.title,
              preview: c.body
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120),
            }))}
          />
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.details}</h2>
          <TicketFieldsForm
            action={updateTicketAction.bind(null, ticket.id)}
            ticket={{
              subject: ticket.subject,
              type: ticket.type,
              statusId: ticket.status.id,
              priorityId: ticket.priority.id,
              categoryId: ticket.category?.id ?? "",
              assigneeId: ticket.assignee?.id ?? "",
              groupId: ticket.group?.id ?? "",
            }}
            statuses={statuses}
            priorities={priorities}
            categories={categories}
            assignees={assignees}
            groups={groups}
            hasChildren={hasChildren}
          />
        </Card>
        <MacrosPanel macros={macros} runAction={runMacroAction.bind(null, ticket.id)} />
        <TagsPanel action={setTagsAction.bind(null, ticket.id)} all={tags} selected={ticket.tags} />
        <TimePanel
          total={ticket.totalMinutes}
          entries={ticket.timeEntries}
          logAction={logTimeAction.bind(null, ticket.id)}
          deleteActions={byId(
            ticket.timeEntries.filter((e) => e.user?.id === actor.id || actor.role === "admin"),
            (e) => deleteTimeAction.bind(null, ticket.id, e.id),
          )}
        />
        <LinksPanel
          links={ticket.links}
          linkAction={linkAction.bind(null, ticket.id)}
          unlinkActions={byId(
            ticket.links.filter((l) => l.kind !== "merged_into" && l.kind !== "merged_from"),
            (l) => unlinkAction.bind(null, ticket.id, l.id),
          )}
        />
        <WatchersPanel
          watchers={ticket.watchers}
          addAction={addWatcherAction.bind(null, ticket.id)}
          removeActions={byId(ticket.watchers, (w) =>
            removeWatcherAction.bind(null, ticket.id, w.id),
          )}
        />
        {ticket.attachments.length > 0 && (
          <Card>
            <h2 className="mb-2 text-lg font-medium">{t.attachments}</h2>
            <AttachmentLinks files={ticket.attachments} />
          </Card>
        )}
        {!mergedAway && <MergePanel action={mergeAction.bind(null, ticket.id)} />}
      </aside>
    </div>
  );
}
