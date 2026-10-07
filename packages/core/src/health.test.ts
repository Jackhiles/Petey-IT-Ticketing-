import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

const fixedClock = () => {
  let t = Date.parse("2026-01-01T00:00:00.000Z");
  return () => new Date((t += 5));
};

describe("checkHealth", () => {
  it("reports ok when the database answers", async () => {
    const report = await checkHealth({ pingDatabase: async () => {}, now: fixedClock() });
    expect(report.status).toBe("ok");
    expect(report.checks.database).toEqual({ status: "ok", latencyMs: 5 });
  });

  it("reports the error without throwing when the database is down", async () => {
    const report = await checkHealth({
      pingDatabase: async () => {
        throw new Error("connection refused");
      },
      now: fixedClock(),
    });
    expect(report.status).toBe("error");
    expect(report.checks.database.error).toBe("connection refused");
  });

  // Integration: runs against the real Postgres named by DATABASE_URL (CI provides one).
  it.skipIf(!process.env.DATABASE_URL)("reaches the configured Postgres", async () => {
    const report = await checkHealth();
    expect(report.checks.database.status).toBe("ok");
  });
});
