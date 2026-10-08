// Helpers for core integration tests. Not exported from the package index.
import { resetDatabase } from "@petey/db/testing";
import { createFirstAdmin } from "./setup";
import { createUser } from "./users";
import type { Actor, Role } from "./permissions";

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const PASSWORD = "correct horse battery";

export { resetDatabase };

/** Resets the database and creates the first admin; returns them as an Actor. */
export async function freshInstall(): Promise<Actor & { email: string }> {
  await resetDatabase();
  const email = "admin@example.test";
  const id = await createFirstAdmin({ name: "Ada Admin", email, password: PASSWORD });
  return { id, role: "admin", isActive: true, email };
}

export async function makeUser(
  admin: Actor,
  role: Role,
  email = `${role}@example.test`,
): Promise<Actor & { email: string }> {
  const id = await createUser(admin, { name: `${role} user`, email, role, password: PASSWORD });
  return { id, role, isActive: true, email };
}

/** Turns a Response's Set-Cookie headers into a Cookie request header. */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
