import type { StatusType } from "@petey/core";
import { cn } from "@/components/ui";

const statusTones: Record<StatusType, string> = {
  open: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: { name: string; type: StatusType } }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        statusTones[status.type],
      )}
    >
      {status.name}
    </span>
  );
}

/** Priority name with its admin-chosen colour as a dot, so meaning never rests on colour alone. */
export function PriorityBadge({ priority }: { priority: { name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span
        aria-hidden
        className="size-2.5 rounded-full"
        style={{ backgroundColor: priority.color }}
      />
      {priority.name}
    </span>
  );
}
