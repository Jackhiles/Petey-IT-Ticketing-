"use client";

import type { CategoryOption, PriorityOption, StatusOption } from "@petey/core";
import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

type Option = { id: string; name: string };

export interface TicketFieldValues {
  subject: string;
  type: "incident" | "request";
  statusId: string;
  priorityId: string;
  categoryId: string;
  assigneeId: string;
  groupId: string;
}

/** Shared by the ticket sidebar and the new-ticket form for the fields a technician sets. */
export function CategorySelect({
  categories,
  defaultValue,
  id = "categoryId",
}: {
  categories: CategoryOption[];
  defaultValue: string;
  id?: string;
}) {
  const t = getMessages().tickets;
  return (
    <Select id={id} name="categoryId" defaultValue={defaultValue}>
      <option value="">{t.noCategory}</option>
      {categories.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={c.id}>{c.name}</option>
          {c.children.map((s) => (
            <option key={s.id} value={s.id}>
              {c.name} › {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function TicketFieldsForm({
  action,
  ticket,
  statuses,
  priorities,
  categories,
  assignees,
  groups,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  ticket: TicketFieldValues;
  statuses: StatusOption[];
  priorities: PriorityOption[];
  categories: CategoryOption[];
  assignees: Option[];
  groups: Option[];
}) {
  const t = getMessages().tickets;
  const [state, formAction, pending] = useActionState(action, initialState);
  const err = (name: string) => errorMessage(state.fieldErrors?.[name]);

  return (
    // key: after a save the server sends new values; remount so defaults pick them up.
    <form key={JSON.stringify(ticket)} action={formAction} className="space-y-3">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && !state.fieldErrors && <Alert>{errorMessage(state.error)}</Alert>}
      <Field id="subject" label={t.subject} error={err("subject")}>
        <Input id="subject" name="subject" defaultValue={ticket.subject} required />
      </Field>
      <Field id="statusId" label={t.status} error={err("statusId")}>
        <Select id="statusId" name="statusId" defaultValue={ticket.statusId}>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="priorityId" label={t.priority} error={err("priorityId")}>
        <Select id="priorityId" name="priorityId" defaultValue={ticket.priorityId}>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="type" label={t.type}>
        <Select id="type" name="type" defaultValue={ticket.type}>
          <option value="incident">{t.types.incident}</option>
          <option value="request">{t.types.request}</option>
        </Select>
      </Field>
      <Field id="categoryId" label={t.category} error={err("categoryId")}>
        <CategorySelect categories={categories} defaultValue={ticket.categoryId} />
      </Field>
      <Field id="assigneeId" label={t.assignee} error={err("assigneeId")}>
        <Select id="assigneeId" name="assigneeId" defaultValue={ticket.assigneeId}>
          <option value="">{t.unassigned}</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="groupId" label={t.group} error={err("groupId")}>
        <Select id="groupId" name="groupId" defaultValue={ticket.groupId}>
          <option value="">{t.noGroup}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? getMessages().common.working : t.saveFields}
      </Button>
    </form>
  );
}
