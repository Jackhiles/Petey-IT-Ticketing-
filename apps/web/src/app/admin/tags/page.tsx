import { listTags, tagUsage, type TagOption } from "@petey/core";
import Link from "next/link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { createTagAction, deleteTagAction, updateTagAction } from "../tickets/actions";
import { ConfigForm } from "../tickets/config-forms";

function TagFields({ prefix, tag }: { prefix: string; tag?: TagOption }) {
  const m = getMessages();
  return (
    <>
      <div className="min-w-40 flex-1">
        <Field id={`${prefix}-name`} label={m.common.name}>
          <Input
            id={`${prefix}-name`}
            name="name"
            defaultValue={tag?.name}
            required
            maxLength={50}
          />
        </Field>
      </div>
      <Field id={`${prefix}-color`} label={m.ticketConfig.color}>
        <Input
          id={`${prefix}-color`}
          name="color"
          type="color"
          defaultValue={tag?.color ?? "#2563eb"}
          className="h-10 w-16 p-1"
        />
      </Field>
    </>
  );
}

export default async function TagsPage() {
  await requireArea("admin");
  const m = getMessages();
  const t = m.productivity;
  const [tags, usage] = await Promise.all([listTags(), tagUsage()]);
  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={t.tagsTitle} />
      <div className="space-y-6">
        {tags.length > 0 && (
          <Card>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tags.map((tag) => (
                <li key={tag.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="mb-2 text-xs text-zinc-500">
                    {m.ticketConfig.tickets(usage[tag.id] ?? 0)}
                  </p>
                  <ConfigForm
                    action={updateTagAction.bind(null, tag.id)}
                    deleteAction={deleteTagAction.bind(null, tag.id)}
                    deleteLabel={m.ticketConfig.deleteConfirm(tag.name)}
                  >
                    <TagFields prefix={tag.id} tag={tag} />
                  </ConfigForm>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.newTag}</h2>
          <ConfigForm action={createTagAction} submitLabel={m.common.create}>
            <TagFields prefix="new-tag" />
          </ConfigForm>
        </Card>
      </div>
    </>
  );
}
