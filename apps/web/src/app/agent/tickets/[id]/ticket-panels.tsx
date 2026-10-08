"use client";

import type { MacroSummary, TagOption, TicketLinkView, TimeEntryView } from "@petey/core";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { formatMinutes } from "@/lib/format";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { StatusBadge } from "@/components/badges";
import { RelativeTime } from "@/components/relative-time";

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Panel({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Card className="p-4">
      <section data-testid={testId}>
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        {children}
      </section>
    </Card>
  );
}

/** A small form that shows its own result and resets after success. */
function MiniForm({
  action,
  children,
  className = "space-y-2",
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const error = state.fieldErrors ? Object.values(state.fieldErrors)[0] : state.error;
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
    </form>
  );
}

function RemoveButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="text-xs text-zinc-500 hover:text-red-600"
        aria-label={label}
        title={label}
      >
        ✕
      </button>
    </form>
  );
}

export function TagChips({ tags }: { tags: TagOption[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700"
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
        </span>
      ))}
    </span>
  );
}

export function TagsPanel({
  action,
  all,
  selected,
}: {
  action: FormAction;
  all: TagOption[];
  selected: TagOption[];
}) {
  const t = getMessages().productivity;
  const [editing, setEditing] = useState(false);
  const chosen = new Set(selected.map((s) => s.id));
  return (
    <Panel title={t.tags} testId="tags-panel">
      {selected.length > 0 ? (
        <TagChips tags={selected} />
      ) : (
        <p className="text-sm text-zinc-500">{t.noTags}</p>
      )}
      {all.length > 0 &&
        (editing ? (
          <MiniForm action={action} className="mt-3 space-y-2">
            <fieldset className="max-h-48 space-y-1 overflow-y-auto">
              <legend className="sr-only">{t.editTags}</legend>
              {all.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={chosen.has(tag.id)}
                    className="size-4"
                  />
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="py-1">
                {getMessages().common.save}
              </Button>
              <Button variant="ghost" className="py-1" onClick={() => setEditing(false)}>
                {getMessages().common.cancel}
              </Button>
            </div>
          </MiniForm>
        ) : (
          <Button variant="ghost" className="mt-2 px-2 py-1" onClick={() => setEditing(true)}>
            {t.editTags}
          </Button>
        ))}
    </Panel>
  );
}

export function WatchersPanel({
  watchers,
  addAction,
  removeActions,
}: {
  watchers: { id: string; email: string; user: { name: string } | null }[];
  addAction: FormAction;
  removeActions: Record<string, () => Promise<void>>;
}) {
  const t = getMessages().productivity;
  return (
    <Panel title={t.watchers} testId="watchers-panel">
      {watchers.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.noWatchers}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {watchers.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2">
              <span className="truncate" title={w.email}>
                {w.user?.name ?? w.email}
              </span>
              {removeActions[w.id] && (
                <RemoveButton
                  action={removeActions[w.id] as () => Promise<void>}
                  label={getMessages().common.remove}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <MiniForm action={addAction} className="mt-3 flex items-end gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="name@example.com"
          aria-label={t.watcherEmail}
        />
        <Button type="submit" variant="secondary" className="py-2">
          {getMessages().common.add}
        </Button>
      </MiniForm>
      <p className="mt-2 text-xs text-zinc-500">{t.watchersHint}</p>
    </Panel>
  );
}

export function LinksPanel({
  links,
  linkAction,
  unlinkActions,
}: {
  links: TicketLinkView[];
  linkAction: FormAction;
  unlinkActions: Record<string, () => Promise<void>>;
}) {
  const t = getMessages().productivity;
  return (
    <Panel title={t.links} testId="links-panel">
      {links.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.noLinks}</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="links">
          {links.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="text-xs text-zinc-500">{t.linkKinds[l.kind]} · </span>
                <Link
                  href={`/agent/tickets/${l.ticket.id}`}
                  className="font-medium hover:underline"
                >
                  {l.ticket.displayNumber}
                </Link>{" "}
                <span className="block truncate text-zinc-600 dark:text-zinc-400">
                  {l.ticket.subject}
                </span>
                <StatusBadge status={l.ticket.status} />
              </span>
              {unlinkActions[l.id] && (
                <RemoveButton
                  action={unlinkActions[l.id] as () => Promise<void>}
                  label={t.unlink}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <MiniForm action={linkAction} className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Select name="kind" defaultValue="related" aria-label={t.linkAs} className="w-auto">
            <option value="related">{t.linkKinds.related}</option>
            <option value="parent">{t.linkKinds.parent}</option>
            <option value="child">{t.linkKinds.child}</option>
          </Select>
          <Input
            name="other"
            required
            placeholder={t.otherTicketPlaceholder}
            aria-label={t.otherTicket}
          />
        </div>
        <Button type="submit" variant="secondary" className="py-1">
          {t.addLink}
        </Button>
      </MiniForm>
    </Panel>
  );
}

export function TimePanel({
  total,
  entries,
  logAction,
  deleteActions,
}: {
  total: number;
  entries: TimeEntryView[];
  logAction: FormAction;
  deleteActions: Record<string, () => Promise<void>>;
}) {
  const t = getMessages().productivity;
  return (
    <Panel title={t.time} testId="time-panel">
      <p className="text-sm font-medium" data-testid="time-total">
        {t.timeTotal(formatMinutes(total))}
      </p>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">{t.noTime}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium">{formatMinutes(e.minutes)}</span>
                <span className="text-zinc-500">
                  {" "}
                  · {e.user?.name ?? getMessages().tickets.unknownUser} ·{" "}
                </span>
                <span className="text-zinc-500">
                  <RelativeTime date={e.workedAt} />
                </span>
                {e.note && (
                  <span className="block truncate text-zinc-600 dark:text-zinc-400">{e.note}</span>
                )}
              </span>
              {deleteActions[e.id] && (
                <RemoveButton
                  action={deleteActions[e.id] as () => Promise<void>}
                  label={getMessages().common.delete}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <MiniForm action={logAction} className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Input
            name="minutes"
            type="number"
            min={1}
            max={1440}
            required
            aria-label={t.minutes}
            placeholder={t.minutes}
            className="w-24"
          />
          <Input name="note" aria-label={t.timeNote} placeholder={t.timeNote} maxLength={500} />
        </div>
        <Button type="submit" variant="secondary" className="py-1">
          {t.logTime}
        </Button>
      </MiniForm>
    </Panel>
  );
}

export function MacrosPanel({
  macros,
  runAction,
}: {
  macros: MacroSummary[];
  runAction: FormAction;
}) {
  const t = getMessages().productivity;
  return (
    <Panel title={t.macros} testId="macros-panel">
      {macros.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.noMacros}</p>
      ) : (
        <ul className="space-y-1">
          {macros.map((m) => (
            <li key={m.id}>
              <MiniForm action={runAction} className="flex items-center justify-between gap-2">
                <input type="hidden" name="macroId" value={m.id} />
                <span className="min-w-0 text-sm">
                  {m.name}
                  <span className="block truncate text-xs text-zinc-500">
                    {m.actions.map((a) => t.actionsSummary[a.type]).join(", ")}
                  </span>
                </span>
                <Button
                  type="submit"
                  variant="secondary"
                  className="px-3 py-1"
                  aria-label={`${t.runMacro}: ${m.name}`}
                >
                  {t.runMacro}
                </Button>
              </MiniForm>
            </li>
          ))}
        </ul>
      )}
      <Link href="/agent/responses" className="mt-3 block text-xs text-zinc-500 underline">
        {t.manageResponses}
      </Link>
    </Panel>
  );
}

export function MergePanel({ action }: { action: FormAction }) {
  const t = getMessages().productivity;
  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer font-semibold">{t.merge}</summary>
      <p className="mt-2 text-xs text-zinc-500">{t.mergeHint}</p>
      <MiniForm action={action} confirm={t.mergeConfirm} className="mt-3 space-y-2">
        <Field id="merge-into" label={t.mergeInto}>
          <Input id="merge-into" name="into" required placeholder={t.otherTicketPlaceholder} />
        </Field>
        <Button type="submit" variant="danger" className="py-1">
          {t.mergeButton}
        </Button>
      </MiniForm>
    </details>
  );
}

export function SplitForm({ action }: { action: FormAction }) {
  const t = getMessages().productivity;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        {t.split}
      </summary>
      <MiniForm action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <Input
          name="subject"
          required
          maxLength={200}
          aria-label={t.splitSubject}
          placeholder={t.splitSubject}
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary" className="py-1">
          {t.splitButton}
        </Button>
      </MiniForm>
    </details>
  );
}
