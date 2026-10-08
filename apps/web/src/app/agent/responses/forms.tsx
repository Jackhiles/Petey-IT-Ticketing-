"use client";

import type { PriorityOption, StatusOption, TagOption } from "@petey/core";
import { useActionState, useEffect, useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;
type Option = { id: string; name: string };

/** Who an item is shared with. Only admins may share, so others get no choice. */
function SharingFields({
  canShare,
  groups,
  prefix,
  defaults,
}: {
  canShare: boolean;
  groups: Option[];
  prefix: string;
  defaults?: { visibility: string; sharedGroupId: string | null };
}) {
  const t = getMessages().productivity;
  const [visibility, setVisibility] = useState(defaults?.visibility ?? "personal");
  if (!canShare) return <input type="hidden" name="visibility" value="personal" />;
  return (
    <div className="flex flex-wrap gap-3">
      <Field id={`${prefix}-visibility`} label={t.sharing}>
        <Select
          id={`${prefix}-visibility`}
          name="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className="w-auto"
        >
          <option value="personal">{t.sharingOptions.personal}</option>
          <option value="all">{t.sharingOptions.all}</option>
          <option value="group">{t.sharingOptions.group}</option>
        </Select>
      </Field>
      {visibility === "group" && (
        <Field id={`${prefix}-group`} label={t.sharedGroup}>
          <Select
            id={`${prefix}-group`}
            name="sharedGroupId"
            defaultValue={defaults?.sharedGroupId ?? ""}
            className="w-auto"
            required
          >
            <option value="" disabled>
              —
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

function useResult(action: FormAction) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (state.ok) setRound((r) => r + 1);
  }, [state]);
  const error = state.fieldErrors ? Object.values(state.fieldErrors)[0] : state.error;
  const feedback = (
    <>
      {error && <Alert>{errorMessage(error)}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
    </>
  );
  return { formAction, pending, round, feedback };
}

export function CannedForm({
  action,
  canShare,
  groups,
  prefix,
  values,
  variables,
}: {
  action: FormAction;
  canShare: boolean;
  groups: Option[];
  prefix: string;
  values?: { title: string; body: string; visibility: string; sharedGroupId: string | null };
  variables: readonly string[];
}) {
  const t = getMessages().productivity;
  const { formAction, pending, round, feedback } = useResult(action);
  return (
    // A new item's form clears after saving; an edit form keeps what was saved.
    <form key={values ? "edit" : round} action={formAction} className="space-y-3">
      <Field id={`${prefix}-title`} label={t.title}>
        <Input
          id={`${prefix}-title`}
          name="title"
          defaultValue={values?.title}
          required
          maxLength={100}
        />
      </Field>
      <div>
        <span id={`${prefix}-body-label`} className="mb-1 block text-sm font-medium">
          {t.body}
        </span>
        <RichTextEditor
          id={`${prefix}-body`}
          name="body"
          initialHtml={values?.body ?? ""}
          labelledBy={`${prefix}-body-label`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t.variablesHint}{" "}
          {variables.map((v) => (
            <code
              key={v}
              className="mr-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800"
            >{`{{${v}}}`}</code>
          ))}
        </p>
      </div>
      <SharingFields canShare={canShare} groups={groups} prefix={prefix} defaults={values} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {values ? getMessages().common.save : getMessages().common.create}
      </Button>
      {feedback}
    </form>
  );
}

export function MacroForm({
  action,
  canShare,
  groups,
  statuses,
  priorities,
  assignees,
  tags,
}: {
  action: FormAction;
  canShare: boolean;
  groups: Option[];
  statuses: StatusOption[];
  priorities: PriorityOption[];
  assignees: Option[];
  tags: TagOption[];
}) {
  const t = getMessages().productivity;
  const { formAction, pending, round, feedback } = useResult(action);
  const tagBoxes = (name: string, legend: string) =>
    tags.length > 0 && (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{legend}</legend>
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name={name} value={tag.id} className="size-4" />
              {tag.name}
            </label>
          ))}
        </div>
      </fieldset>
    );

  return (
    <form key={round} action={formAction} className="space-y-3">
      <Field id="macro-name" label={t.macroName}>
        <Input id="macro-name" name="name" required maxLength={100} />
      </Field>
      <div>
        <span id="macro-reply-label" className="mb-1 block text-sm font-medium">
          {t.macroReply}
        </span>
        <RichTextEditor id="macro-reply" name="replyBody" labelledBy="macro-reply-label" />
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" name="internal" className="size-4" />
          {t.macroInternal}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="macro-status" label={t.macroSetStatus}>
          <Select id="macro-status" name="statusId" defaultValue="">
            <option value="">{t.noChange}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="macro-priority" label={t.macroSetPriority}>
          <Select id="macro-priority" name="priorityId" defaultValue="">
            <option value="">{t.noChange}</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="macro-assign" label={t.macroAssign}>
          <Select id="macro-assign" name="assign" defaultValue="">
            <option value="">{t.noChange}</option>
            <option value="me">{t.assignMe}</option>
            <option value="unassigned">{getMessages().tickets.unassigned}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="macro-group" label={t.macroSetGroup}>
          <Select id="macro-group" name="groupId" defaultValue="keep">
            <option value="keep">{t.noChange}</option>
            <option value="">{getMessages().tickets.noGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {tagBoxes("addTags", t.macroAddTags)}
      {tagBoxes("removeTags", t.macroRemoveTags)}
      <SharingFields canShare={canShare} groups={groups} prefix="macro" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {getMessages().common.create}
      </Button>
      {feedback}
    </form>
  );
}
