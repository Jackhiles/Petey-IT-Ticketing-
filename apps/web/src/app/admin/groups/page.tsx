import { listGroups } from "@petey/core";
import Link from "next/link";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { createGroupAction } from "./actions";
import { GroupForm } from "./group-forms";

export default async function GroupsPage() {
  const actor = await requireArea("admin");
  const t = getMessages();
  const groups = await listGroups(actor);

  return (
    <>
      <PageHeader title={t.groups.title} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <TableWrap>
          <thead>
            <tr>
              <th>{t.common.name}</th>
              <th>{t.groups.description}</th>
              <th>{t.groups.members}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link href={`/admin/groups/${g.id}`} className="font-medium hover:underline">
                    {g.name}
                  </Link>
                </td>
                <td className="text-zinc-500">{g.description}</td>
                <td>{t.groups.memberCount(g.memberCount)}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-zinc-500">
                  {t.groups.noGroups}
                </td>
              </tr>
            )}
          </tbody>
        </TableWrap>
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.groups.new}</h2>
          <GroupForm action={createGroupAction} submitLabel={t.common.create} />
        </Card>
      </div>
    </>
  );
}
