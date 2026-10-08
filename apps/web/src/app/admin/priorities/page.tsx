import { listPriorities, ticketUsage, type PriorityOption } from "@petey/core";
import Link from "next/link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import {
  createPriorityAction,
  deletePriorityAction,
  updatePriorityAction,
} from "../tickets/actions";
import { ConfigForm } from "../tickets/config-forms";

function PriorityFields({ prefix, priority }: { prefix: string; priority?: PriorityOption }) {
  const m = getMessages();
  const c = m.ticketConfig;
  return (
    <>
      <div className="min-w-40 flex-1">
        <Field id={`${prefix}-name`} label={m.common.name}>
          <Input id={`${prefix}-name`} name="name" defaultValue={priority?.name} required />
        </Field>
      </div>
      <Field id={`${prefix}-level`} label={c.level} hint={priority ? undefined : c.levelHint}>
        <Input
          id={`${prefix}-level`}
          name="level"
          type="number"
          min={0}
          max={100}
          defaultValue={priority?.level ?? 1}
          className="w-24"
          required
        />
      </Field>
      <Field id={`${prefix}-color`} label={c.color}>
        <Input
          id={`${prefix}-color`}
          name="color"
          type="color"
          defaultValue={priority?.color ?? "#64748b"}
          className="h-10 w-16 p-1"
        />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={priority?.isDefault}
          className="size-4"
        />
        {c.isDefault}
      </label>
    </>
  );
}

export default async function PrioritiesPage() {
  await requireArea("admin");
  const m = getMessages();
  const c = m.ticketConfig;
  const [priorities, usage] = await Promise.all([listPriorities(), ticketUsage()]);

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={c.prioritiesTitle} />
      <div className="space-y-6">
        <Card>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {priorities.map((p) => (
              <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                <p className="mb-2 text-xs text-zinc-500">
                  {c.tickets(usage.priorities[p.id] ?? 0)}
                  {p.isDefault && ` · ${c.default}`}
                </p>
                <ConfigForm
                  action={updatePriorityAction.bind(null, p.id)}
                  deleteAction={deletePriorityAction.bind(null, p.id)}
                  deleteLabel={c.deleteConfirm(p.name)}
                >
                  <PriorityFields prefix={p.id} priority={p} />
                </ConfigForm>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-medium">{c.newPriority}</h2>
          <ConfigForm action={createPriorityAction} submitLabel={m.common.create}>
            <PriorityFields prefix="new-priority" />
          </ConfigForm>
        </Card>
      </div>
    </>
  );
}
