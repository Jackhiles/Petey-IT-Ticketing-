"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function GroupForm({
  action,
  values,
  submitLabel,
}: {
  action: Action;
  values?: { name: string; description: string };
  submitLabel: string;
}) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <Field id="group-name" label={t.common.name} error={errorMessage(state.fieldErrors?.name)}>
        <Input id="group-name" name="name" defaultValue={values?.name} required />
      </Field>
      <Field id="group-description" label={t.groups.description}>
        <Input id="group-description" name="description" defaultValue={values?.description} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t.common.working : submitLabel}
      </Button>
    </form>
  );
}

export function AddMemberForm({
  action,
  candidates,
}: {
  action: Action;
  candidates: { id: string; name: string; email: string }[];
}) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Field
          id="userId"
          label={t.groups.addMember}
          error={errorMessage(state.fieldErrors?.userId ?? state.error)}
        >
          <Select id="userId" name="userId" required defaultValue="">
            <option value="" disabled>
              {t.groups.chooseMember}
            </option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || candidates.length === 0}>
        {t.common.add}
      </Button>
    </form>
  );
}

export function ConfirmButton({
  action,
  label,
  confirm,
  variant = "danger",
}: {
  action: () => Promise<void>;
  label: string;
  confirm?: string;
  variant?: "danger" | "ghost";
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
