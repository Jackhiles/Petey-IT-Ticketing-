import {
  applicableFields,
  listAssignees,
  listCustomFields,
  listCategories,
  listGroupOptions,
  listPriorities,
  listRequesterOptions,
} from "@petey/core";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { NewTicketForm } from "./new-ticket-form";

export default async function NewTicketPage() {
  const actor = await requireArea("agent");
  const t = getMessages().tickets;
  const [requesters, priorities, categories, assignees, groups, defs] = await Promise.all([
    listRequesterOptions(actor),
    listPriorities(),
    listCategories(),
    listAssignees(actor),
    listGroupOptions(actor),
    listCustomFields(),
  ]);
  return (
    <>
      <Link href="/agent" className="text-sm text-zinc-500 hover:underline">
        ← {getMessages().agent.title}
      </Link>
      <PageHeader title={t.newTitle} />
      <Card className="max-w-3xl">
        <NewTicketForm
          currentUserId={actor.id}
          requesters={requesters}
          priorities={priorities}
          categories={categories}
          assignees={assignees}
          groups={groups}
          fields={[
            ...applicableFields(defs, { ticketType: "incident", forRequester: false }),
            ...applicableFields(defs, { ticketType: "request", forRequester: false }).filter(
              (d) => d.appliesTo === "request",
            ),
          ]}
        />
      </Card>
    </>
  );
}
