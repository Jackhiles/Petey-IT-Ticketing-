import { getPrisma } from "@petey/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins/two-factor";
import { appSecret, appUrl, authRateLimitEnabled } from "./config";
import type { Actor, Role } from "./permissions";

export const MIN_PASSWORD_LENGTH = 10;

function createAuth() {
  return betterAuth({
    appName: "Petey",
    baseURL: appUrl(),
    basePath: "/api/auth",
    secret: appSecret(),
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "petey",
    },
    // Limits repeated sign-in and code attempts per client (Better Auth's defaults:
    // 3 sign-in or two-factor attempts per 10 seconds).
    rateLimit: { enabled: authRateLimitEnabled() },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "requester", input: false },
        departmentId: { type: "string", required: false, input: false },
        isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Accounts are created by an admin or the first-run setup, never by self sign-up.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        // Outbound email arrives in Phase 4. Until then the link goes to the server log,
        // and admins can also set a new password from the users screen.
        console.info(`[auth] password reset requested for ${user.email}: ${url}`);
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Deactivated users cannot start a session.
          before: async (session) => {
            const user = await getPrisma().user.findUnique({
              where: { id: session.userId },
              select: { isActive: true },
            });
            return user?.isActive === true;
          },
        },
      },
    },
    plugins: [twoFactor({ issuer: "Petey" })],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { peteyAuth?: Auth };

/** The Better Auth instance, created on first use so builds never need env vars. */
export function getAuth(): Auth {
  globalForAuth.peteyAuth ??= createAuth();
  return globalForAuth.peteyAuth;
}

/** Serves every /api/auth/* request. */
export function authHandler(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export interface SessionUser extends Actor {
  email: string;
  name: string;
  twoFactorEnabled: boolean;
}

/**
 * Returns the signed-in user for a request, or null. Reads the user row fresh so a role
 * change or deactivation takes effect on the next request.
 */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      twoFactorEnabled: true,
    },
  });
  if (!user || !user.isActive) return null;
  return { ...user, role: user.role as Role };
}
