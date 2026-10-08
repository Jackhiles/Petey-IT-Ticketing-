"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * One editable row or panel on the status, priority and category screens: its own form,
 * save button, optional delete button, and the result of the last attempt.
 */
export function ConfigForm({
  action,
  deleteAction,
  deleteLabel,
  submitLabel,
  children,
  testId,
}: {
  action: FormAction;
  deleteAction?: (prev: ActionState) => Promise<ActionState>;
  deleteLabel?: string;
  submitLabel?: string;
  children: ReactNode;
  testId?: string;
}) {
  const t = getMessages().common;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [deleteState, deleteFormAction, deleting] = useActionState(
    deleteAction ?? (async () => initialState),
    initialState,
  );
  const error = state.fieldErrors ? Object.values(state.fieldErrors)[0] : state.error;

  return (
    <div className="space-y-2" data-testid={testId}>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        {children}
        <Button type="submit" variant="secondary" disabled={pending}>
          {submitLabel ?? t.save}
        </Button>
      </form>
      {deleteAction && (
        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (deleteLabel && !window.confirm(deleteLabel)) e.preventDefault();
          }}
        >
          <Button type="submit" variant="ghost" className="px-2 text-red-600" disabled={deleting}>
            {t.delete}
          </Button>
        </form>
      )}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {deleteState.error && <Alert>{errorMessage(deleteState.error)}</Alert>}
    </div>
  );
}
