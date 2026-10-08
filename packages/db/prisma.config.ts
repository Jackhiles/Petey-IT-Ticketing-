import { defineConfig } from "prisma/config";

// Local development keeps settings in the repository-root .env; containers and CI set real env vars.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file: rely on the process environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Optional here so `prisma generate` works without a database (Docker build, CI lint).
  datasource: { url: process.env.DATABASE_URL },
});
