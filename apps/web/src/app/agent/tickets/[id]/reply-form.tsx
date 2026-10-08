"use client";

import type { StatusOption } from "@petey/core";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { insertIntoEditor, RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, cn, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { renderCannedAction } from "./actions";
import { TYPING_EVENT } from "./presence-bar";

const EDITOR_ID = "reply-body";

type Canned = { id: string; title: string; preview: string };

/** Searchable list of canned responses; picking one inserts it, filled in, at the cursor. */
function CannedPicker({ ticketId, canned }: { ticketId: string; canned: Canned[] }) {
  const t = getMessages().productivity;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, startTransition] = useTransition();
  const q = query.trim().toLowerCase();
  const matches = canned.filter(
    (c) => !q || c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q),
  );

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="px-2 py-1"
        onClick={() => setOpen(true)}
        disabled={canned.length === 0}
      >
        {t.insertCanned}
      </Button>
    );
  }
  return (
    <div className="w-full rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchCanned}
        aria-label={t.searchCanned}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <ul className="mt-2 max-h-56 overflow-y-auto" role="listbox" aria-label={t.cannedResponses}>
        {matches.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              disabled={busy}
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() =>
                startTransition(async () => {
                  const html = await renderCannedAction(c.id, ticketId);
                  if (html) insertIntoEditor(EDITOR_ID, html);
                  setOpen(false);
                  setQuery("");
                })
              }
            >
              <span className="font-medium">{c.title}</span>
              <span className="block truncate text-xs text-zinc-500">{c.preview}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-zinc-500">{t.noCanned}</li>
        )}
      </ul>
    </div>
  );
}

export function ReplyForm({
  action,
  ticketId,
  statuses,
  maxMb,
  canned,
  seenUpdatedAt,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  ticketId: string;
  statuses: StatusOption[];
  maxMb: number;
  canned: Canned[];
  /** The ticket's updatedAt when this page rendered, for the collision check. */
  seenUpdatedAt: string;
}) {
  const t = getMessages().tickets;
  const p = getMessages().productivity;
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [state, formAction, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  // Remounting the editor and form after a successful send clears them.
  const [round, setRound] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  // React resets the form after every action, so keep what was sent for "Send anyway".
  const lastSent = useRef<FormData | null>(null);
  useEffect(() => {
    if (state.ok) {
      setRound((r) => r + 1);
      formRef.current?.reset();
    }
  }, [state]);

  const stale = state.error === "ticket_changed";
  const sendAnyway = () => {
    const form = lastSent.current;
    if (!form) return;
    form.set("confirmStale", "1");
    startTransition(() => formAction(form));
  };

  const tab = (value: "reply" | "note", label: string) => (
    <label
      className={cn(
        "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium",
        kind === value
          ? value === "note"
            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-zinc-200 dark:bg-zinc-800"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
      )}
    >
      <input
        type="radio"
        name="kind"
        value={value}
        checked={kind === value}
        onChange={() => setKind(value)}
        className="sr-only"
      />
      {label}
    </label>
  );

  const err = state.fieldErrors?.bodyHtml ?? state.fieldErrors?.files ?? state.fieldErrors?.minutes;

  return (
    <form
      ref={formRef}
      action={(form) => {
        lastSent.current = form;
        formAction(form);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="seenUpdatedAt" value={seenUpdatedAt} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t.reply} className="flex gap-1">
          {tab("reply", t.reply)}
          {tab("note", t.internalNote)}
        </div>
        <CannedPicker ticketId={ticketId} canned={canned} />
      </div>
      {kind === "note" && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t.internalNoteHint}</p>
      )}
      {err && <Alert>{errorMessage(err)}</Alert>}
      {stale && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>{p.staleConfirm}</span>
          <Button variant="secondary" className="py-1" onClick={sendAnyway} disabled={pending}>
            {p.sendAnyway}
          </Button>
        </div>
      )}
      {state.error && !state.fieldErrors && !stale && <Alert>{errorMessage(state.error)}</Alert>}
      <span id="reply-label" className="sr-only">
        {t.editor.label}
      </span>
      <RichTextEditor
        key={round}
        id={EDITOR_ID}
        name="bodyHtml"
        labelledBy="reply-label"
        onChange={() => window.dispatchEvent(new Event(TYPING_EVENT))}
      />
      <div className="flex flex-wrap gap-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="reply-files" className="text-sm font-medium">
            {t.attachFiles}
          </label>
          <input
            id="reply-files"
            name="files"
            type="file"
            multiple
            className="mt-1 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">{t.attachHint(maxMb)}</p>
        </div>
        <div>
          <label htmlFor="reply-minutes" className="text-sm font-medium">
            {p.minutesWithReply}
          </label>
          <Input
            id="reply-minutes"
            name="minutes"
            type="number"
            min={0}
            max={1440}
            className="mt-1 w-28"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? getMessages().common.working : kind === "note" ? t.addNote : t.send}
        </Button>
        <span className="text-sm text-zinc-500">{t.sendAndSet}</span>
        <Select name="statusId" defaultValue="" aria-label={t.sendAndSet} className="w-auto">
          <option value="">{t.keepStatus}</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
    </form>
  );
}
