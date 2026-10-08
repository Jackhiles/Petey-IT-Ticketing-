"use client";

import type { CategoryOption, CustomFieldDefView } from "@petey/core";
import { useActionState, useState, useTransition } from "react";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { raiseTicketAction } from "../../actions";

export function RaiseTicketForm({
  categories,
  requireCategory,
  fields,
  maxMb,
  initialSubject,
}: {
  categories: CategoryOption[];
  requireCategory: boolean;
  fields: CustomFieldDefView[];
  maxMb: number;
  initialSubject: string;
}) {
  const t = getMessages().portal;
  const [state, action, pending] = useActionState(raiseTicketAction, initialState);
  const [, startTransition] = useTransition();
  const [type, setType] = useState<"incident" | "request">("incident");
  const err = (name: string) => errorMessage(state.fieldErrors?.[name]);
  const shown = fields.filter((f) => f.appliesTo === "all" || f.appliesTo === type);

  return (
    <form
      // Submitting by hand stops React clearing the form when the server reports a missing
      // field, so the requester doesn't lose what they typed.
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => action(form));
      }}
      className="space-y-5"
    >
      {state.error && <Alert>{errorMessage(state.error)}</Alert>}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t.type}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["incident", "request"] as const).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800"
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="mt-0.5 size-4"
              />
              {t.types[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="subject" label={`${t.subject} *`} error={err("subject")} hint={t.subjectHint}>
        <Input id="subject" name="subject" required maxLength={200} defaultValue={initialSubject} />
      </Field>

      {categories.length > 0 && (
        <Field
          id="categoryId"
          label={requireCategory ? `${t.category} *` : t.category}
          error={err("categoryId")}
        >
          <Select id="categoryId" name="categoryId" defaultValue="" required={requireCategory}>
            <option value="">{t.chooseCategory}</option>
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
        </Field>
      )}

      <div>
        <span id="description-label" className="mb-1 block text-sm font-medium">
          {t.description} *
        </span>
        <RichTextEditor id="description" name="descriptionHtml" labelledBy="description-label" />
        {err("descriptionHtml") ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {err("descriptionHtml")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">{t.descriptionHint}</p>
        )}
      </div>

      {shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <CustomFieldInputs defs={shown} errors={state.fieldErrors} prefix="portal" />
        </div>
      )}

      <div>
        <label htmlFor="files" className="text-sm font-medium">
          {t.attachments}
        </label>
        <input id="files" name="files" type="file" multiple className="mt-1 block w-full text-sm" />
        <p className="mt-1 text-xs text-zinc-500">{t.attachHint(maxMb)}</p>
        {err("files") && <p className="mt-1 text-sm text-red-600">{err("files")}</p>}
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? getMessages().common.working : t.submit}
      </Button>
    </form>
  );
}
