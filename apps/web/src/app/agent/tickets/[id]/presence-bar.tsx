"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { getMessages } from "@/messages";

/** The reply form dispatches this on every keystroke so the heartbeat can report typing. */
export const TYPING_EVENT = "petey:typing";

const HEARTBEAT_MS = 5_000;
const TYPING_FOR_MS = 6_000;

type Viewer = { id: string; name: string; isTyping: boolean };

/**
 * Collision detection on the ticket page: shows other technicians who have the ticket open
 * or are typing, and warns when the ticket changes after this page loaded.
 */
export function PresenceBar({
  ticketId,
  seenUpdatedAt,
}: {
  ticketId: string;
  seenUpdatedAt: string;
}) {
  const t = getMessages().productivity;
  const router = useRouter();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [stale, setStale] = useState(false);
  const lastTyped = useRef(0);
  const seen = useRef(seenUpdatedAt);

  // A refresh after our own change brings a newer time; nothing is stale any more.
  useEffect(() => {
    seen.current = seenUpdatedAt;
    setStale(false);
  }, [seenUpdatedAt]);

  useEffect(() => {
    const url = `/api/tickets/${ticketId}/presence`;
    let cancelled = false;
    const beat = async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing: Date.now() - lastTyped.current < TYPING_FOR_MS }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { viewers: Viewer[]; ticketUpdatedAt: string };
        setViewers(data.viewers);
        setStale(new Date(data.ticketUpdatedAt).getTime() > new Date(seen.current).getTime());
      } catch {
        // Offline for a moment; the next beat will catch up.
      }
    };
    const onTyping = () => {
      const quiet = Date.now() - lastTyped.current > TYPING_FOR_MS;
      lastTyped.current = Date.now();
      if (quiet) void beat(); // tell others straight away when typing starts
    };
    const leave = () =>
      navigator.sendBeacon(
        url,
        new Blob([JSON.stringify({ leave: true })], { type: "application/json" }),
      );

    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener(TYPING_EVENT, onTyping);
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(TYPING_EVENT, onTyping);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [ticketId]);

  const typing = viewers.filter((v) => v.isTyping).map((v) => v.name);
  const watching = viewers.filter((v) => !v.isTyping).map((v) => v.name);
  if (!stale && viewers.length === 0) return null;

  return (
    <div className="space-y-2" aria-live="polite" data-testid="presence">
      {stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>{t.staleBanner}</span>
          <Button variant="secondary" className="py-1" onClick={() => router.refresh()}>
            {t.reload}
          </Button>
        </div>
      )}
      {viewers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
          </span>
          {typing.length > 0 && (
            <span data-testid="presence-typing">{t.typing(typing.join(", "))}</span>
          )}
          {watching.length > 0 && (
            <span data-testid="presence-viewing">{t.viewing(watching.join(", "))}</span>
          )}
        </div>
      )}
    </div>
  );
}
