import { listDepartments } from "@petey/core";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { createUserAction } from "../actions";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  await requireArea("admin");
  const t = getMessages();
  const departments = await listDepartments();
  return (
    <>
      <Link href="/admin/users" className="text-sm text-zinc-500 hover:underline">
        ← {t.users.title}
      </Link>
      <PageHeader title={t.users.newTitle} />
      <Card className="max-w-xl">
        <UserForm action={createUserAction} departments={departments} />
      </Card>
    </>
  );
}
