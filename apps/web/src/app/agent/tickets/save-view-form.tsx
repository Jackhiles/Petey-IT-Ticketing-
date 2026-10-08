"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { initialState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { saveViewAction } from "./actions";

/** Saves the list's current filters and sort as a named view. */
export function SaveViewForm({ query }: { query: Record<string, string | string[]> }) {
  const t = getMessages().tickets;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveViewAction, initialState);

  if (!open) {
    return (
      <Button variant="ghost" className="w-full justify-start px-2" onClick={() => setOpen(true)}>
        + {t.saveView}
      </Button>
    );
  }
  return (
    <form
      action={action}
      className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
    >
      {state.error && !state.fieldErrors && <Alert>{errorMessage(state.error)}</Alert>}
      <input type="hidden" name="query" value={JSON.stringify(query)} />
      <Field id="view-name" label={t.viewName} error={errorMessage(state.fieldErrors?.name)}>
        <Input id="view-name" name="name" required autoFocus />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shared" className="size-4" />
        {t.shareView}
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t.saveView}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {getMessages().common.cancel}
        </Button>
      </div>
    </form>
  );
}
