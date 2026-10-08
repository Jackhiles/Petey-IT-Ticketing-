// Environment settings read by core. All secrets come from the environment.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Sign-in rate limiting is on unless AUTH_RATE_LIMIT=off. Only automated test runs, which
 * sign in many times a second from one address, should turn it off.
 */
export function authRateLimitEnabled(): boolean {
  return process.env.AUTH_RATE_LIMIT !== "off";
}

export function appSecret(): string {
  const secret = required("APP_SECRET");
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("APP_SECRET must be at least 32 characters");
  }
  return secret;
}
