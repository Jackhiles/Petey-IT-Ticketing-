import { listCategories, ticketUsage, type CategoryOption } from "@petey/core";
import Link from "next/link";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "../tickets/actions";
import { ConfigForm } from "../tickets/config-forms";

function CategoryFields({
  prefix,
  topLevel,
  category,
  parentId,
}: {
  prefix: string;
  topLevel: CategoryOption[];
  category?: { id: string; name: string; sortOrder: number };
  parentId: string | null;
}) {
  const m = getMessages();
  const c = m.ticketConfig;
  return (
    <>
      <div className="min-w-40 flex-1">
        <Field id={`${prefix}-name`} label={m.common.name}>
          <Input id={`${prefix}-name`} name="name" defaultValue={category?.name} required />
        </Field>
      </div>
      <Field id={`${prefix}-parent`} label={c.parent}>
        <Select
          id={`${prefix}-parent`}
          name="parentId"
          defaultValue={parentId ?? ""}
          className="w-auto"
        >
          <option value="">{c.topLevel}</option>
          {topLevel
            .filter((t) => t.id !== category?.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
          defaultValue={category?.sortOrder ?? 0}
          className="w-24"
        />
      </Field>
    </>
  );
}

export default async function CategoriesPage() {
  await requireArea("admin");
  const m = getMessages();
  const c = m.ticketConfig;
  const [categories, usage] = await Promise.all([listCategories(), ticketUsage()]);

  const row = (cat: { id: string; name: string; sortOrder: number }, parentId: string | null) => (
    <ConfigForm
      action={updateCategoryAction.bind(null, cat.id)}
      deleteAction={deleteCategoryAction.bind(null, cat.id)}
      deleteLabel={c.deleteConfirm(cat.name)}
    >
      <CategoryFields prefix={cat.id} topLevel={categories} category={cat} parentId={parentId} />
    </ConfigForm>
  );

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={c.categoriesTitle} />
      <div className="space-y-6">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <p className="mb-2 text-xs text-zinc-500">{c.tickets(usage.categories[cat.id] ?? 0)}</p>
            {row(cat, null)}
            {cat.children.length > 0 && (
              <ul className="mt-4 space-y-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                {cat.children.map((child) => (
                  <li key={child.id}>
                    <p className="mb-2 text-xs text-zinc-500">
                      {c.tickets(usage.categories[child.id] ?? 0)}
                    </p>
                    {row(child, cat.id)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
        <Card>
          <h2 className="mb-4 text-lg font-medium">{c.newCategory}</h2>
          <ConfigForm action={createCategoryAction} submitLabel={m.common.create}>
            <CategoryFields prefix="new-category" topLevel={categories} parentId={null} />
          </ConfigForm>
        </Card>
      </div>
    </>
  );
}
