"use client";

import type { CategoryOption, PriorityOption } from "@petey/core";
import { useActionState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { createTicketAction } from "../actions";
import { CategorySelect } from "../[id]/ticket-fields-form";

type Option = { id: string; name: string };

export function NewTicketForm({
  currentUserId,
  requesters,
  priorities,
  categories,
  assignees,
  groups,
}: {
  currentUserId: string;
  requesters: (Option & { email: string })[];
  priorities: PriorityOption[];
  categories: CategoryOption[];
  assignees: Option[];
  groups: Option[];
}) {
  const t = getMessages().tickets;
  const [state, action, pending] = useActionState(createTicketAction, initialState);
  const err = (name: string) => errorMessage(state.fieldErrors?.[name]);

  return (
    <form action={action} className="space-y-4">
      {state.error && !state.fieldErrors && <Alert>{errorMessage(state.error)}</Alert>}
      <Field id="requesterId" label={t.requester} error={err("requesterId")}>
        <Select id="requesterId" name="requesterId" defaultValue={currentUserId}>
          {requesters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.email})
            </option>
          ))}
        </Select>
      </Field>
      <Field id="subject" label={t.subject} error={err("subject")}>
        <Input id="subject" name="subject" required maxLength={200} />
      </Field>
      <div>
        <span id="description-label" className="mb-1 block text-sm font-medium">
          {t.description}
        </span>
        <RichTextEditor id="description" name="descriptionHtml" labelledBy="description-label" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="type" label={t.type}>
          <Select id="type" name="type" defaultValue="incident">
            <option value="incident">{t.types.incident}</option>
            <option value="request">{t.types.request}</option>
          </Select>
        </Field>
        <Field id="priorityId" label={t.priority} error={err("priorityId")}>
          <Select
            id="priorityId"
            name="priorityId"
            defaultValue={priorities.find((p) => p.isDefault)?.id}
          >
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="categoryId" label={t.category} error={err("categoryId")}>
          <CategorySelect categories={categories} defaultValue="" />
        </Field>
        <Field id="assigneeId" label={t.assignee} error={err("assigneeId")}>
          <Select id="assigneeId" name="assigneeId" defaultValue="">
            <option value="">{t.unassigned}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="groupId" label={t.group} error={err("groupId")}>
          <Select id="groupId" name="groupId" defaultValue="">
            <option value="">{t.noGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? getMessages().common.working : t.new}
      </Button>
    </form>
  );
}
