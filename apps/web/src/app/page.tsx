import { checkHealth, type CheckStatus } from "@petey/core";
import { getMessages } from "@/messages";

export const dynamic = "force-dynamic";

function StatusBadge({ status, label }: { status: CheckStatus; label: string }) {
  const tone =
    status === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return (
    <span data-testid="status" className={`rounded-full px-3 py-1 text-sm font-medium ${tone}`}>
      {label}
    </span>
  );
}

export default async function HealthPage() {
  const t = getMessages();
  const report = await checkHealth();
  const label = (s: CheckStatus) => (s === "ok" ? t.health.ok : t.health.error);

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t.app.name}</h1>
      <p className="mt-1 text-zinc-500 dark:text-zinc-400">{t.app.tagline}</p>

      <section className="mt-10 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t.health.title}</h2>
          <StatusBadge status={report.status} label={label(report.status)} />
        </div>
        <dl className="mt-6 grid grid-cols-[1fr_auto] gap-y-3 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">{t.health.database}</dt>
          <dd data-testid="database-status">{label(report.checks.database.status)}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">{t.health.latency}</dt>
          <dd>{report.checks.database.latencyMs} ms</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">{t.health.checkedAt}</dt>
          <dd>
            <time dateTime={report.checkedAt}>{report.checkedAt}</time>
          </dd>
        </dl>
      </section>
    </main>
  );
}
