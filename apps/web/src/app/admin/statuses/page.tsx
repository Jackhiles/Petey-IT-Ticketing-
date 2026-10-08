import { listStatuses, STATUS_TYPES, ticketUsage, type StatusOption } from "@petey/core";
import Link from "next/link";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { createStatusAction, deleteStatusAction, updateStatusAction } from "../tickets/actions";
import { ConfigForm } from "../tickets/config-forms";

function StatusFields({ prefix, status }: { prefix: string; status?: StatusOption }) {
  const m = getMessages();
  const c = m.ticketConfig;
  return (
    <>
      <div className="min-w-40 flex-1">
        <Field id={`${prefix}-name`} label={m.common.name}>
          <Input id={`${prefix}-name`} name="name" defaultValue={status?.name} required />
        </Field>
      </div>
      <Field id={`${prefix}-type`} label={c.type}>
        <Select
          id={`${prefix}-type`}
          name="type"
          defaultValue={status?.type ?? "open"}
          className="w-auto"
        >
          {STATUS_TYPES.map((s) => (
            <option key={s} value={s}>
              {m.tickets.statusTypes[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-order`} label={c.sortOrder}>
        <Input
          id={`${prefix}-order`}
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={status?.sortOrder ?? 0}
          className="w-24"
        />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm" title={c.pausesSlaHint}>
        <input
          type="checkbox"
          name="pausesSla"
          defaultChecked={status?.pausesSla}
          className="size-4"
        />
        {c.pausesSla}
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={status?.isDefault}
          className="size-4"
        />
        {c.isDefault}
      </label>
    </>
  );
}

export default async function StatusesPage() {
  await requireArea("admin");
  const m = getMessages();
  const c = m.ticketConfig;
  const [statuses, usage] = await Promise.all([listStatuses(), ticketUsage()]);

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={c.statusesTitle} />
      <div className="space-y-6">
        <Card>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {statuses.map((s) => (
              <li key={s.id} className="py-4 first:pt-0 last:pb-0">
                <p className="mb-2 text-xs text-zinc-500">
                  {c.tickets(usage.statuses[s.id] ?? 0)}
                  {s.isDefault && ` · ${c.default}`}
                </p>
                <ConfigForm
                  testId={`status-${s.name}`}
                  action={updateStatusAction.bind(null, s.id)}
                  deleteAction={deleteStatusAction.bind(null, s.id)}
                  deleteLabel={c.deleteConfirm(s.name)}
                >
                  <StatusFields prefix={s.id} status={s} />
                </ConfigForm>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-medium">{c.newStatus}</h2>
          <ConfigForm action={createStatusAction} submitLabel={m.common.create}>
            <StatusFields prefix="new-status" />
          </ConfigForm>
        </Card>
      </div>
    </>
  );
}
