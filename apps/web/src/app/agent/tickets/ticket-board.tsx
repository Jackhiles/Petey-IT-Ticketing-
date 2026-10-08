"use client";

import type { StatusOption, TicketBoardColumn, TicketListItem } from "@petey/core";
import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition, type DragEvent } from "react";
import { Alert, cn } from "@/components/ui";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { setTicketStatusAction } from "./actions";
import { PriorityBadge } from "./badges";
import { RelativeTime } from "./relative-time";

type Move = { ticketId: string; statusId: string };

const columnAccent: Record<StatusOption["type"], string> = {
  open: "border-t-sky-500",
  on_hold: "border-t-amber-500",
  resolved: "border-t-emerald-500",
  closed: "border-t-zinc-400",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** Moves a card between columns without waiting for the server, keeping counts in step. */
function applyMove(columns: TicketBoardColumn[], move: Move): TicketBoardColumn[] {
  const card = columns.flatMap((c) => c.items).find((t) => t.id === move.ticketId);
  const target = columns.find((c) => c.status.id === move.statusId);
  if (!card || !target || card.status.id === move.statusId) return columns;
  return columns.map((c) => {
    if (c.status.id === card.status.id) {
      return { ...c, total: c.total - 1, items: c.items.filter((t) => t.id !== card.id) };
    }
    if (c.status.id === move.statusId) {
      return { ...c, total: c.total + 1, items: [{ ...card, status: target.status }, ...c.items] };
    }
    return c;
  });
}

function Card({
  ticket,
  statuses,
  onMove,
}: {
  ticket: TicketListItem;
  statuses: StatusOption[];
  onMove: (move: Move) => void;
}) {
  const t = getMessages().tickets;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", ticket.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      data-testid="board-card"
      className="cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/agent/tickets/${ticket.id}`}
          className="min-w-0 flex-1 font-medium leading-snug hover:underline"
        >
          {ticket.subject}
        </Link>
        <span
          title={ticket.assignee ? `${t.assignee}: ${ticket.assignee.name}` : t.unassigned}
          aria-label={ticket.assignee ? `${t.assignee}: ${ticket.assignee.name}` : t.unassigned}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            ticket.assignee
              ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
              : "border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-600",
          )}
        >
          {ticket.assignee ? initials(ticket.assignee.name) : "?"}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-zinc-500">
        {ticket.displayNumber} · {ticket.requester.name}
        {ticket.group && ` · ${ticket.group.name}`}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {t.created} <RelativeTime date={ticket.createdAt} />
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <select
          value={ticket.status.id}
          onChange={(e) => onMove({ ticketId: ticket.id, statusId: e.target.value })}
          aria-label={`${t.status}: ${ticket.subject}`}
          className="max-w-[60%] rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <PriorityBadge priority={ticket.priority} />
      </div>
    </li>
  );
}

/**
 * Tickets as one column per status. Drag a card to another column, or use its status menu,
 * to change the ticket's status; the change shows at once and is saved in the background.
 */
export function TicketBoard({
  columns,
  statuses,
  listHref,
}: {
  columns: TicketBoardColumn[];
  statuses: StatusOption[];
  /** Builds a list-view link showing every ticket in one status. */
  listHref: Record<string, string>;
}) {
  const t = getMessages().tickets;
  const [optimistic, move] = useOptimistic(columns, applyMove);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Set once React has attached the drag handlers to the server-rendered cards.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const onMove = (m: Move) =>
    startTransition(async () => {
      setError(null);
      move(m);
      const result = await setTicketStatusAction(m.ticketId, m.statusId);
      if (!result.ok) setError(errorMessage(result.fieldErrors?.statusId ?? result.error) ?? null);
    });

  const dropHandlers = (statusId: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(statusId);
    },
    onDragLeave: () => setOver((o) => (o === statusId ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const ticketId = e.dataTransfer.getData("text/plain");
      if (ticketId) onMove({ ticketId, statusId });
    },
  });

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div
        className="flex gap-4 overflow-x-auto pb-4"
        data-testid="ticket-board"
        data-ready={ready || undefined}
      >
        {optimistic.map((column) => (
          <section
            key={column.status.id}
            aria-label={`${column.status.name} (${column.total})`}
            data-testid={`board-column-${column.status.name}`}
            {...dropHandlers(column.status.id)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-zinc-100 p-3 dark:bg-zinc-900/60",
              columnAccent[column.status.type],
              over === column.status.id && "ring-2 ring-zinc-400",
            )}
          >
            <h2 className="mb-3 flex items-baseline justify-between px-1 text-sm font-semibold">
              <span>{column.status.name}</span>
              <span className="text-zinc-500" data-testid="column-count">
                {column.total}
              </span>
            </h2>
            <ul className="flex min-h-24 flex-col gap-3">
              {column.items.map((ticket) => (
                <Card key={ticket.id} ticket={ticket} statuses={statuses} onMove={onMove} />
              ))}
            </ul>
            {column.total > column.items.length && (
              <Link
                href={listHref[column.status.id] ?? "/agent"}
                className="mt-3 px-1 text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
              >
                {t.boardShowAll(column.total)}
              </Link>
            )}
            {column.total === 0 && <p className="px-1 text-xs text-zinc-500">{t.boardEmpty}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
