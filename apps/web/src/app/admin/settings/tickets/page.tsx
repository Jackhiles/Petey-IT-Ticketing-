import { formatTicketNumber, getTicketSettings } from "@petey/core";
import Link from "next/link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { updateTicketSettingsAction } from "../../tickets/actions";
import { ConfigForm } from "../../tickets/config-forms";

export default async function TicketSettingsPage() {
  await requireArea("admin");
  const m = getMessages();
  const s = m.ticketSettings;
  const { prefix, requireCategoryOnPortal } = await getTicketSettings();
  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← {m.admin.title}
      </Link>
      <PageHeader title={s.title} />
      <Card className="max-w-xl">
        <p className="mb-4 text-sm text-zinc-500">{s.example(formatTicketNumber(1234, prefix))}</p>
        <ConfigForm action={updateTicketSettingsAction}>
          <div className="flex-1">
            <Field id="prefix" label={s.prefix} hint={s.prefixHint}>
              <Input id="prefix" name="prefix" defaultValue={prefix} maxLength={10} required />
            </Field>
          </div>
          <label className="flex w-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requireCategoryOnPortal"
              defaultChecked={requireCategoryOnPortal}
              className="size-4"
            />
            {s.requireCategory}
          </label>
        </ConfigForm>
      </Card>
    </>
  );
}
