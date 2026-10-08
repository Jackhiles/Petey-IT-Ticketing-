"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

export function PortalReplyForm({
  action,
  maxMb,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  maxMb: number;
}) {
  const t = getMessages().portal;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const [round, setRound] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  // Clear only after a successful send, so a failed one keeps what was written.
  useEffect(() => {
    if (state.ok) {
      setRound((r) => r + 1);
      ref.current?.reset();
    }
  }, [state]);
  const error = state.fieldErrors?.bodyHtml ?? state.fieldErrors?.files ?? state.error;

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => formAction(form));
      }}
      className="space-y-3"
    >
      {error && <Alert>{errorMessage(error)}</Alert>}
      <span id="portal-reply-label" className="sr-only">
        {t.reply}
      </span>
      <RichTextEditor
        key={round}
        id="portal-reply"
        name="bodyHtml"
        labelledBy="portal-reply-label"
      />
      <div>
        <label htmlFor="portal-files" className="text-sm font-medium">
          {t.attachments}
        </label>
        <input
          id="portal-files"
          name="files"
          type="file"
          multiple
          className="mt-1 block w-full text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">{t.attachHint(maxMb)}</p>
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? getMessages().common.working : t.send}
      </Button>
    </form>
  );
}

/** A single-button form for "my issue is solved" and "reopen". */
export function StatusButton({
  action,
  label,
  confirm,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  label: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="space-y-2"
    >
      {state.error && <Alert>{errorMessage(state.error)}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
        {label}
      </Button>
    </form>
  );
}
