import { getPrisma } from "@petey/db";

export type CheckStatus = "ok" | "error";

export interface HealthReport {
  status: CheckStatus;
  checkedAt: string;
  checks: {
    database: { status: CheckStatus; latencyMs: number; error?: string };
  };
}

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
  now: () => Date;
}

const defaultDeps: HealthDeps = {
  pingDatabase: async () => {
    await getPrisma().$queryRaw`SELECT 1`;
  },
  now: () => new Date(),
};

/** Reports whether Petey can reach the services it depends on. Never throws. */
export async function checkHealth(deps: HealthDeps = defaultDeps): Promise<HealthReport> {
  const started = deps.now().getTime();
  let database: HealthReport["checks"]["database"];
  try {
    await deps.pingDatabase();
    database = { status: "ok", latencyMs: deps.now().getTime() - started };
  } catch (err) {
    database = {
      status: "error",
      latencyMs: deps.now().getTime() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    status: database.status,
    checkedAt: deps.now().toISOString(),
    checks: { database },
  };
}
