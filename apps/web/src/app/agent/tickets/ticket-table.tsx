"use client";

import type { TicketListItem } from "@petey/core";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Select, TableWrap } from "@/components/ui";
import { initialState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { bulkUpdateAction } from "./actions";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { RelativeTime } from "@/components/relative-time";
import { TagChips } from "./[id]/ticket-panels";

type Option = { id: string; name: string };

export function TicketTable({
  items,
  assignees,
  groups,
}: {
  items: TicketListItem[];
  assignees: Option[];
  groups: Option[];
}) {
  const t = getMessages().tickets;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(bulkUpdateAction, initialState);

  // Clear the selection after a successful bulk change, and when the list changes.
  useEffect(() => {
    if (state.ok) setSelected(new Set());
  }, [state]);
  const ids = items.map((i) => i.id).join(",");
  useEffect(() => setSelected(new Set()), [ids]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={action} className="space-y-3">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{errorMessage(state.fieldErrors?._form ?? state.error)}</Alert>}

      {selected.size > 0 && (
        <div
          role="region"
          aria-label={t.selected(selected.size)}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="font-medium">{t.selected(selected.size)}</span>
          <Select
            name="assigneeId"
            defaultValue="keep"
            aria-label={t.bulkAssign}
            className="w-auto"
          >
            <option value="keep">
              {t.bulkAssign}: {t.noChange}
            </option>
            <option value="">{t.unassigned}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select name="groupId" defaultValue="keep" aria-label={t.bulkGroup} className="w-auto">
            <option value="keep">
              {t.bulkGroup}: {t.noChange}
            </option>
            <option value="">{t.noGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Button type="submit" name="intent" value="apply" variant="secondary" disabled={pending}>
            {t.bulkApply}
          </Button>
          <Button type="submit" name="intent" value="close" variant="secondary" disabled={pending}>
            {t.bulkClose}
          </Button>
        </div>
      )}

      <TableWrap>
        <thead>
          <tr>
            <th className="w-8">
              <input
                type="checkbox"
                className="size-4"
                aria-label={t.selectAll}
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))
                }
              />
            </th>
            <th>{t.number}</th>
            <th>{t.subject}</th>
            <th>{t.status}</th>
            <th>{t.priority}</th>
            <th>{t.requester}</th>
            <th>{t.assignee}</th>
            <th>{t.updated}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ticket) => (
            <tr key={ticket.id} data-testid="ticket-row">
              <td>
                <input
                  type="checkbox"
                  name="ids"
                  value={ticket.id}
                  className="size-4"
                  aria-label={t.selectTicket(ticket.displayNumber)}
                  checked={selected.has(ticket.id)}
                  onChange={() => toggle(ticket.id)}
                />
              </td>
              <td className="whitespace-nowrap text-zinc-500">{ticket.displayNumber}</td>
              <td className="max-w-md">
                <Link href={`/agent/tickets/${ticket.id}`} className="font-medium hover:underline">
                  {ticket.subject}
                </Link>
                {ticket.tags.length > 0 && (
                  <div className="mt-1">
                    <TagChips tags={ticket.tags} />
                  </div>
                )}
                {(ticket.category || ticket.group) && (
                  <div className="truncate text-xs text-zinc-500">
                    {[ticket.category, ticket.group?.name].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td>
                <StatusBadge status={ticket.status} />
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="whitespace-nowrap">{ticket.requester.name}</td>
              <td className="whitespace-nowrap">
                {ticket.assignee?.name ?? <span className="text-zinc-400">{t.unassigned}</span>}
              </td>
              <td className="whitespace-nowrap text-zinc-500">
                <RelativeTime date={ticket.updatedAt} />
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-zinc-500">
                {t.noTickets}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </form>
  );
}
