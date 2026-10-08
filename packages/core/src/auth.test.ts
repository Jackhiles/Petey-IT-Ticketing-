import { getPrisma } from "@petey/db";
import * as OTPAuth from "otpauth";
import { beforeEach, describe, expect, it } from "vitest";
import { getAuth, getSessionUser } from "./auth";
import { cookieHeader, freshInstall, hasDatabase, makeUser, PASSWORD } from "./test-support";
import { updateUser } from "./users";
import type { Actor } from "./permissions";

async function signIn(email: string, password = PASSWORD): Promise<Response> {
  return getAuth().api.signInEmail({ body: { email, password }, asResponse: true });
}

describe.skipIf(!hasDatabase)("sign-in", () => {
  let admin: Actor & { email: string };
  beforeEach(async () => {
    admin = await freshInstall();
  });

  it("signs in with email and password and resolves the session user", async () => {
    const res = await signIn(admin.email);
    expect(res.status).toBe(200);
    const user = await getSessionUser(new Headers({ cookie: cookieHeader(res) }));
    expect(user).toMatchObject({ id: admin.id, role: "admin", twoFactorEnabled: false });
  });

  it("rejects a wrong password", async () => {
    const res = await signIn(admin.email, "not the password");
    expect(res.status).toBe(401);
  });

  it("refuses to sign in a deactivated user", async () => {
    const tech = await makeUser(admin, "technician");
    await updateUser(admin, tech.id, { isActive: false });
    const res = await signIn(tech.email);
    expect(res.ok).toBe(false);
    expect(await getPrisma().session.count({ where: { userId: tech.id } })).toBe(0);
  });

  it("does not allow self sign-up", async () => {
    const res = await getAuth().api.signUpEmail({
      body: { name: "Mallory", email: "mallory@example.test", password: PASSWORD },
      asResponse: true,
    });
    expect(res.ok).toBe(false);
    expect(await getPrisma().user.count({ where: { email: "mallory@example.test" } })).toBe(0);
  });

  it("does not let a user change their own role", async () => {
    const tech = await makeUser(admin, "technician");
    const res = await signIn(tech.email);
    const headers = new Headers({ cookie: cookieHeader(res) });
    await getAuth()
      .api.updateUser({ body: { role: "admin" } as never, headers })
      .catch(() => undefined);
    expect((await getPrisma().user.findUniqueOrThrow({ where: { id: tech.id } })).role).toBe(
      "technician",
    );
  });

  it("requires a TOTP code or a recovery code once two-factor is enabled", async () => {
    const tech = await makeUser(admin, "technician");
    const auth = getAuth();
    const headers = new Headers({ cookie: cookieHeader(await signIn(tech.email)) });

    const enabled = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrollment");
    const { totpURI, backupCodes } = enabled;
    const totp = OTPAuth.URI.parse(totpURI);
    // Confirming enrollment rotates the session; the old cookie stops working.
    const confirmed = await auth.api.verifyTOTP({
      body: { code: totp.generate() },
      headers,
      asResponse: true,
    });
    expect(confirmed.status).toBe(200);
    const enrolled = await getSessionUser(new Headers({ cookie: cookieHeader(confirmed) }));
    expect(enrolled?.twoFactorEnabled).toBe(true);

    // Password alone now only starts a two-factor challenge.
    const challenge = await signIn(tech.email);
    expect(await challenge.clone().json()).toMatchObject({ twoFactorRedirect: true });
    const challengeHeaders = new Headers({ cookie: cookieHeader(challenge) });
    expect(await getSessionUser(challengeHeaders)).toBeNull();

    // A recovery code completes it.
    const done = await auth.api.verifyBackupCode({
      body: { code: backupCodes[0] ?? "" },
      headers: challengeHeaders,
      asResponse: true,
    });
    expect(done.status).toBe(200);
    const user = await getSessionUser(new Headers({ cookie: cookieHeader(done) }));
    expect(user?.id).toBe(tech.id);
  });
});
