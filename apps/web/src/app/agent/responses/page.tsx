import {
  can,
  listAssignees,
  listCannedResponses,
  listGroupOptions,
  listMacros,
  listPriorities,
  listStatuses,
  listTags,
  TEMPLATE_VARIABLES,
} from "@petey/core";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import {
  createCannedAction,
  createMacroAction,
  deleteCannedAction,
  deleteMacroAction,
  updateCannedAction,
} from "./actions";
import { CannedForm, MacroForm } from "./forms";

function DeleteButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <button type="submit" className="text-sm text-red-600 hover:underline">
        {label}
      </button>
    </form>
  );
}

/** Technicians manage their personal canned responses and macros; admins also the shared ones. */
export default async function ResponsesPage() {
  const actor = await requireArea("agent");
  const m = getMessages();
  const t = m.productivity;
  const canShare = can(actor, "admin.sharedResponses");
  const [canned, macros, groups, statuses, priorities, assignees, tags] = await Promise.all([
    listCannedResponses(actor),
    listMacros(actor),
    listGroupOptions(actor),
    listStatuses(),
    listPriorities(),
    listAssignees(actor),
    listTags(),
  ]);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "";
  const sharedLabel = (v: string, groupId: string | null) =>
    v === "group"
      ? `${t.sharingOptions.group}: ${groupName(groupId)}`
      : t.sharingOptions[v as "personal" | "all"];

  return (
    <>
      <Link href="/agent" className="text-sm text-zinc-500 hover:underline">
        ← {m.agent.title}
      </Link>
      <PageHeader title={t.responsesTitle} />
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-4" aria-labelledby="canned-heading">
          <h2 id="canned-heading" className="text-lg font-medium">
            {t.cannedResponses}
          </h2>
          {canned.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.title}</span>
                <span className="flex items-center gap-3">
                  <Badge>{sharedLabel(c.visibility, c.sharedGroupId)}</Badge>
                  {c.canManage && (
                    <DeleteButton
                      action={deleteCannedAction.bind(null, c.id)}
                      label={m.common.delete}
                    />
                  )}
                </span>
              </div>
              {c.canManage ? (
                <details>
                  <summary className="cursor-pointer text-sm text-zinc-500">
                    {m.ticketConfig.edit}
                  </summary>
                  <div className="mt-3">
                    <CannedForm
                      action={updateCannedAction.bind(null, c.id)}
                      canShare={canShare}
                      groups={groups}
                      prefix={`canned-${c.id}`}
                      values={c}
                      variables={TEMPLATE_VARIABLES}
                    />
                  </div>
                </details>
              ) : (
                <p className="text-xs text-zinc-500">
                  {t.owner}: {c.ownerName}
                </p>
              )}
            </Card>
          ))}
          <Card>
            <h3 className="mb-3 font-medium">{t.newCanned}</h3>
            <CannedForm
              action={createCannedAction}
              canShare={canShare}
              groups={groups}
              prefix="new-canned"
              variables={TEMPLATE_VARIABLES}
            />
          </Card>
        </section>

        <section className="space-y-4" aria-labelledby="macros-heading">
          <h2 id="macros-heading" className="text-lg font-medium">
            {t.macros}
          </h2>
          {macros.map((macro) => (
            <Card key={macro.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{macro.name}</span>
                <span className="flex items-center gap-3">
                  <Badge>{sharedLabel(macro.visibility, macro.sharedGroupId)}</Badge>
                  {macro.canManage && (
                    <DeleteButton
                      action={deleteMacroAction.bind(null, macro.id)}
                      label={m.common.delete}
                    />
                  )}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {macro.actions.map((a) => t.actionsSummary[a.type]).join(", ")}
              </p>
            </Card>
          ))}
          <Card>
            <h3 className="mb-3 font-medium">{t.newMacro}</h3>
            <MacroForm
              action={createMacroAction}
              canShare={canShare}
              groups={groups}
              statuses={statuses}
              priorities={priorities}
              assignees={assignees}
              tags={tags}
            />
          </Card>
        </section>
      </div>
    </>
  );
}
