import { getPrisma } from "@petey/db";
import { ConflictError } from "./errors";
import { createUserSchema, insertUserWithPassword } from "./users";
import { parse } from "./validation";

const firstAdminSchema = createUserSchema.omit({ role: true, departmentId: true });

// Arbitrary constant key for the Postgres advisory lock that serialises first-run setup.
const SETUP_LOCK_KEY = 7_242_001;

/** True until the first user exists; the web app then shows the first-run setup screen. */
export async function needsSetup(): Promise<boolean> {
  return (await getPrisma().user.count()) === 0;
}

/**
 * Creates the first admin on a fresh install. Safe against two browsers submitting at
 * once: the second caller waits on the lock, sees a user exists, and is refused.
 */
export async function createFirstAdmin(input: unknown): Promise<string> {
  const data = parse(firstAdminSchema, input);
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
    if ((await tx.user.count()) > 0) throw new ConflictError("setup_already_done");
    return insertUserWithPassword(tx, { ...data, role: "admin", departmentId: null }, null);
  });
}
