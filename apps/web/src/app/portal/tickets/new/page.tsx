import {
  applicableFields,
  attachmentMaxBytes,
  getTicket,
  getTicketSettings,
  listCategories,
  listCustomFields,
} from "@petey/core";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { RaiseTicketForm } from "./raise-ticket-form";

export default async function NewPortalTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ followUp?: string }>;
}) {
  const actor = await requireArea("portal");
  const t = getMessages().portal;
  const { followUp } = await searchParams;
  const [categories, defs, settings] = await Promise.all([
    listCategories(),
    listCustomFields(),
    getTicketSettings(),
  ]);
  // A follow-up to one of the requester's own closed tickets starts with its subject.
  const previous = followUp ? await getTicket(actor, followUp).catch(() => null) : null;

  return (
    <>
      <Link href="/portal" className="text-sm text-zinc-500 hover:underline">
        ← {t.backToList}
      </Link>
      <PageHeader title={t.newTitle} />
      <p className="-mt-4 mb-6 text-sm text-zinc-500">{t.newIntro}</p>
      <Card className="max-w-3xl">
        <RaiseTicketForm
          categories={categories}
          requireCategory={settings.requireCategoryOnPortal && categories.length > 0}
          // Every field a requester may see; the form shows those for the chosen type.
          fields={[
            ...applicableFields(defs, { ticketType: "incident", forRequester: true }),
            ...applicableFields(defs, { ticketType: "request", forRequester: true }).filter(
              (d) => d.appliesTo === "request",
            ),
          ]}
          maxMb={Math.round(attachmentMaxBytes() / (1024 * 1024))}
          initialSubject={
            previous ? t.followUpSubject(previous.displayNumber, previous.subject) : ""
          }
        />
      </Card>
    </>
  );
}
