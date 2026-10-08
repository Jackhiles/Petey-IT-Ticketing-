import { getPrisma } from "./index";
import { seed } from "./seed";

/**
 * Empties every application table and re-seeds, for tests only. Refuses to run unless the
 * database name contains "test", so it can never wipe a real install by accident.
 */
export async function resetDatabase(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName.includes("test")) {
    throw new Error(`resetDatabase refuses to run against "${dbName}": name must contain "test"`);
  }

  const prisma = getPrisma();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
  await seed(prisma);
}
