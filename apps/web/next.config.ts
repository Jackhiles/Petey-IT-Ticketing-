import type { NextConfig } from "next";

// In development, settings live in the repository-root .env (Next only reads apps/web/.env).
// Containers set real environment variables, so a missing file is fine.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file.
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@petey/core", "@petey/db"],
  serverExternalPackages: ["@prisma/client"],
  poweredByHeader: false,
};

export default nextConfig;
