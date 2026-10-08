import { getGroup, listUsers, NotFoundError } from "@petey/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import {
  addMemberAction,
  deleteGroupAction,
  removeMemberAction,
  updateGroupAction,
} from "../actions";
import { AddMemberForm, ConfirmButton, GroupForm } from "../group-forms";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireArea("admin");
  const t = getMessages();
  const { id } = await params;

  const group = await getGroup(actor, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const memberIds = new Set(group.members.map((m) => m.id));
  const staff = (await listUsers(actor)).filter(
    (u) => u.isActive && u.role !== "requester" && !memberIds.has(u.id),
  );

  return (
    <>
      <Link href="/admin/groups" className="text-sm text-zinc-500 hover:underline">
        ← {t.groups.title}
      </Link>
      <PageHeader
        title={group.name}
        actions={
          <ConfirmButton
            action={deleteGroupAction.bind(null, group.id)}
            label={t.groups.deleteGroup}
            confirm={t.groups.deleteConfirm}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.groups.members}</h2>
          {group.members.length === 0 ? (
            <p className="mb-4 text-sm text-zinc-500">{t.groups.noMembers}</p>
          ) : (
            <ul
              className="mb-4 divide-y divide-zinc-200 dark:divide-zinc-800"
              data-testid="group-members"
            >
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-zinc-500">· {t.roles[m.role]}</span>
                  </span>
                  <ConfirmButton
                    action={removeMemberAction.bind(null, group.id, m.id)}
                    label={t.common.remove}
                    variant="ghost"
                  />
                </li>
              ))}
            </ul>
          )}
          <AddMemberForm action={addMemberAction.bind(null, group.id)} candidates={staff} />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.common.name}</h2>
          <GroupForm
            action={updateGroupAction.bind(null, group.id)}
            values={group}
            submitLabel={t.common.save}
          />
        </Card>
      </div>
    </>
  );
}
