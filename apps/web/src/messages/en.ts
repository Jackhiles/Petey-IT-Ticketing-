// The message catalog. Every user-facing string goes here so Petey can be translated later.
export const en = {
  app: {
    name: "Petey",
    tagline: "Self-hosted IT service desk",
  },
  health: {
    title: "System status",
    overall: "Overall",
    database: "Database",
    ok: "Operational",
    error: "Unavailable",
    latency: "Response time",
    checkedAt: "Checked at",
  },
} as const;

export type Messages = typeof en;
