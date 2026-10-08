import { CUSTOM_FIELD_TYPES, listCustomFields, type CustomFieldDefView } from "@petey/core";
import Link from "next/link";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { createCustomFieldAction, updateCustomFieldAction } from "../tickets/actions";
import { ConfigForm } from "../tickets/config-forms";

/** The settings every field has; key and type are only chosen when creating one. */
function CommonFields({ prefix, def }: { prefix: string; def?: CustomFieldDefView }) {
  const m = getMessages();
  const t = m.customFields;
  const check = (name: string, label: string, checked: boolean) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-4" />
      {label}
    </label>
  );
  return (
    <>
      <div className="min-w-48 flex-1">
        <Field id={`${prefix}-label`} label={t.label}>
          <Input
            id={`${prefix}-label`}
            name="label"
            defaultValue={def?.label}
            required
            maxLength={100}
          />
        </Field>
      </div>
      <Field id={`${prefix}-applies`} label={t.appliesTo}>
        <Select
          id={`${prefix}-applies`}
          name="appliesTo"
          defaultValue={def?.appliesTo ?? "all"}
          className="w-auto"
        >
          {(["all", "incident", "request"] as const).map((a) => (
            <option key={a} value={a}>
              {t.appliesToOptions[a]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-order`} label={t.sortOrder}>
        <Input
          id={`${prefix}-order`}
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={def?.sortOrder ?? 0}
          className="w-24"
        />
      </Field>
      {(!def || def.fieldType === "select") && (
        <div className="w-full">
          <Field id={`${prefix}-options`} label={t.options} hint={t.optionsHint}>
            <textarea
              id={`${prefix}-options`}
              name="options"
              rows={3}
              defaultValue={def?.options.join("\n")}
              className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </Field>
        </div>
      )}
      <div className="flex w-full flex-wrap gap-x-6 gap-y-2">
        {check("required", t.required, def?.required ?? false)}
        {check("visibleToRequesters", t.visibleToRequesters, def?.visibleToRequesters ?? true)}
        {check("isActive", t.active, def?.isActive ?? true)}
      </div>
    </>
  );
}

export default async function CustomFieldsPage() {
  await requireArea("admin");
  const m = getMessages();
  const t = m.customFields;
  const fields = await listCustomFields();

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={t.title} />
      <p className="-mt-4 mb-6 max-w-2xl text-sm text-zinc-500">{t.intro}</p>
      <div className="space-y-6">
        {fields.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.none}</p>
        ) : (
          fields.map((def) => (
            <Card key={def.id} className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{def.key}</code>
                <Badge>{t.types[def.fieldType]}</Badge>
                {!def.visibleToRequesters && <Badge tone="warning">{t.technicianOnly}</Badge>}
                {!def.isActive && <Badge>{m.common.inactive}</Badge>}
              </div>
              <ConfigForm action={updateCustomFieldAction.bind(null, def.id)}>
                <CommonFields prefix={def.id} def={def} />
              </ConfigForm>
            </Card>
          ))
        )}
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.newField}</h2>
          <ConfigForm action={createCustomFieldAction} submitLabel={m.common.create}>
            <Field id="new-key" label={t.key} hint={t.keyHint}>
              <Input
                id="new-key"
                name="key"
                required
                pattern="[a-z][a-z0-9_]{1,39}"
                className="w-48"
              />
            </Field>
            <Field id="new-type" label={t.fieldType}>
              <Select id="new-type" name="fieldType" defaultValue="text" className="w-auto">
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.types[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <CommonFields prefix="new" />
          </ConfigForm>
          <p className="mt-2 text-xs text-zinc-500">{t.inactiveHint}</p>
        </Card>
      </div>
    </>
  );
}
