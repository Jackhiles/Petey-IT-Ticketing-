import { listUsers, ROLES, type Role } from "@petey/core";
import Link from "next/link";
import { Badge, Button, buttonClass, Input, PageHeader, Select, TableWrap } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const actor = await requireArea("admin");
  const t = getMessages();
  const { q = "", role = "" } = await searchParams;
  const roleFilter = (ROLES as readonly string[]).includes(role) ? (role as Role) : undefined;
  const users = await listUsers(actor, { query: q, ...(roleFilter ? { role: roleFilter } : {}) });

  return (
    <>
      <PageHeader
        title={t.users.title}
        actions={
          <Link href="/admin/users/new" className={buttonClass()}>
            {t.users.new}
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t.users.searchPlaceholder}
          aria-label={t.common.search}
          className="max-w-xs"
        />
        <Select name="role" defaultValue={role} aria-label={t.common.role} className="w-auto">
          <option value="">{t.common.all}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t.common.search}
        </Button>
      </form>
      <TableWrap>
        <thead>
          <tr>
            <th>{t.common.name}</th>
            <th>{t.common.email}</th>
            <th>{t.common.role}</th>
            <th>{t.users.department}</th>
            <th>{t.users.twoFactor}</th>
            <th>{t.common.status}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {u.name}
                </Link>
              </td>
              <td>{u.email}</td>
              <td>{t.roles[u.role]}</td>
              <td>{u.departmentName ?? "—"}</td>
              <td>{u.twoFactorEnabled ? <Badge tone="success">{t.common.active}</Badge> : "—"}</td>
              <td>
                <Badge tone={u.isActive ? "success" : "neutral"}>
                  {u.isActive ? t.common.active : t.common.inactive}
                </Badge>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-zinc-500">
                {t.users.noUsers}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </>
  );
}
