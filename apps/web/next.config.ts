import type { NextConfig } from "next";

// In development, settings live in the repository-root .env (Next only reads apps/web/.env).
// Containers set real environment variables, so a missing file is fine.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file.
}

// Replies carry attachments through server actions. Files on one message may total twice
// ATTACHMENT_MAX_MB (enforced in packages/core); allow that plus room for the form itself.
const attachmentMaxMb = Number(process.env.ATTACHMENT_MAX_MB) || 25;

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@petey/core", "@petey/db"],
  serverExternalPackages: ["@prisma/client"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: `${attachmentMaxMb * 2 + 2}mb` },
  },
};

export default nextConfig;
