import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export { Prisma, PrismaClient } from "./generated/prisma/client";
export type * from "./generated/prisma/models";
export { UserRole } from "./generated/prisma/enums";
export { seed } from "./seed";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process, created on first use so importing this module never needs a
// database (e.g. during `next build`). In development, hot reload re-evaluates modules,
// so the client is parked on globalThis to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { peteyPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.peteyPrisma ??= createClient();
  return globalForPrisma.peteyPrisma;
}

/** The client handed to a `$transaction` callback. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
