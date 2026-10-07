import { PgBoss } from "pg-boss";
import { checkHealth } from "@petey/core";

// Phase 0: the worker only boots pg-boss and proves it can reach the database.
// Job handlers (IMAP polling, outbound email, SLA timers, automation) arrive in later phases.

const HEARTBEAT_QUEUE = "system.heartbeat";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err: Error) => console.error("[worker] pg-boss error:", err));

  await boss.start();
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, "*/5 * * * *");
  await boss.work(HEARTBEAT_QUEUE, async () => {
    const report = await checkHealth();
    console.log(`[worker] heartbeat: database ${report.checks.database.status}`);
  });

  console.log("[worker] ready");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, stopping`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
