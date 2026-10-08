"use client";

import type { StatusOption } from "@petey/core";
import { useActionState, useEffect, useRef, useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, cn, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

export function ReplyForm({
  action,
  statuses,
  maxMb,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  statuses: StatusOption[];
  maxMb: number;
}) {
  const t = getMessages().tickets;
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [state, formAction, pending] = useActionState(action, initialState);
  // Remounting the editor and form after a successful send clears them.
  const [round, setRound] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      setRound((r) => r + 1);
      formRef.current?.reset();
    }
  }, [state]);

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

  const err = state.fieldErrors?.bodyHtml ?? state.fieldErrors?.files;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div role="radiogroup" aria-label={t.reply} className="flex gap-1">
        {tab("reply", t.reply)}
        {tab("note", t.internalNote)}
      </div>
      {kind === "note" && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t.internalNoteHint}</p>
      )}
      {err && <Alert>{errorMessage(err)}</Alert>}
      {state.error && !state.fieldErrors && <Alert>{errorMessage(state.error)}</Alert>}
      <span id="reply-label" className="sr-only">
        {t.editor.label}
      </span>
      <RichTextEditor key={round} id="reply-body" name="bodyHtml" labelledBy="reply-label" />
      <div>
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
