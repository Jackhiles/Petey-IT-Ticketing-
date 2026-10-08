import { getUser, listDepartments, listGroups, NotFoundError } from "@petey/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { resetTwoFactorAction, setPasswordAction, updateUserAction } from "../actions";
import { UserForm } from "../user-form";
import { ResetTwoFactorForm, SetPasswordForm } from "./account-forms";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const actor = await requireArea("admin");
  const t = getMessages();
  const { id } = await params;
  const { created } = await searchParams;

  const user = await getUser(actor, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [departments, groups] = await Promise.all([listDepartments(), listGroups(actor)]);
  const memberOf = groups.filter((g) => user.groupIds.includes(g.id));

  return (
    <>
      <Link href="/admin/users" className="text-sm text-zinc-500 hover:underline">
        ← {t.users.title}
      </Link>
      <PageHeader title={user.name} />
      {created && (
        <div className="mb-4">
          <Alert tone="success">{t.users.created}</Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.users.editTitle}</h2>
          <UserForm
            action={updateUserAction.bind(null, user.id)}
            departments={departments}
            values={user}
          />
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-lg font-medium">{t.users.groups}</h2>
            {memberOf.length === 0 ? (
              <p className="text-sm text-zinc-500">{t.users.noGroups}</p>
            ) : (
              <ul className="list-inside list-disc text-sm">
                {memberOf.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-1 text-lg font-medium">{t.users.setPassword}</h2>
            <p className="mb-4 text-sm text-zinc-500">{t.users.setPasswordHint}</p>
            <SetPasswordForm action={setPasswordAction.bind(null, user.id)} />
          </Card>
          {user.twoFactorEnabled && (
            <Card>
              <h2 className="mb-1 text-lg font-medium">{t.users.resetTwoFactor}</h2>
              <p className="mb-4 text-sm text-zinc-500">{t.users.resetTwoFactorHint}</p>
              <ResetTwoFactorForm action={resetTwoFactorAction.bind(null, user.id)} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
