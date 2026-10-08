import { resetDatabase } from "@petey/db/testing";

/**
 * Starts every end-to-end run from an empty install. resetDatabase refuses to run unless
 * the database name contains "test", so this can't wipe a real Petey.
 */
export default async function globalSetup(): Promise<void> {
  await resetDatabase();
}
