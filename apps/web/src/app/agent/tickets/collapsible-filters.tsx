"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, cn } from "@/components/ui";
import { getMessages } from "@/messages";

const STORAGE_KEY = "petey.ticketFilters.open";

/**
 * The ticket list's filter dropdowns behind a toggle. The search box and buttons stay in
 * `toolbar`; the toggle shows how many filters are active, so a hidden filter is never a
 * surprise. The open/closed choice is remembered in this browser.
 */
export function CollapsibleFilters({
  toolbar,
  activeCount,
  children,
}: {
  toolbar: ReactNode;
  activeCount: number;
  children: ReactNode;
}) {
  const t = getMessages().tickets;
  const panelId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage blocked: start closed.
    }
  }, []);

  const toggle = () =>
    setOpen((was) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, was ? "0" : "1");
      } catch {
        // Storage blocked: the choice lasts for this page only.
      }
      return !was;
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <Button
          variant="secondary"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="filters-toggle"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          {t.filters}
          {activeCount > 0 && (
            <span
              className="rounded-full bg-zinc-900 px-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
              aria-label={t.activeFilters(activeCount)}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </div>
      {/* Hidden, not removed, so closed filters still apply when the form is submitted. */}
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50",
        )}
      >
        {children}
      </div>
    </div>
  );
}
