"use client";

import { useEffect, useState } from "react";

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function relative(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

/**
 * Shows a UTC time as "5 minutes ago" in the viewer's locale, with the full local time on
 * hover. The server renders the ISO time; the browser fills in the relative text.
 */
export function RelativeTime({ date }: { date: Date | string }) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);
  useEffect(() => {
    const update = () => setText(relative(iso, Date.now()));
    update();
    setTitle(new Date(iso).toLocaleString());
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);
  return (
    <time dateTime={iso} title={title}>
      {text ?? `${iso.slice(0, 16).replace("T", " ")} UTC`}
    </time>
  );
}
