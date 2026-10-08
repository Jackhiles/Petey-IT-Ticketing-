import { getPrisma } from "@petey/db";
import { z } from "zod";
import { writeAudit } from "./audit";
import { ForbiddenError } from "./errors";
import { can, type Actor } from "./permissions";
import { parse } from "./validation";

export const securitySettingsSchema = z.object({
  /** Technicians and admins must enroll in two-factor sign-in before using Petey. */
  requireTwoFactor: z.boolean(),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

const SECURITY_KEY = "security";
const SECURITY_DEFAULTS: SecuritySettings = { requireTwoFactor: false };

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const row = await getPrisma().setting.findUnique({ where: { key: SECURITY_KEY } });
  const parsed = securitySettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : SECURITY_DEFAULTS;
}

export async function updateSecuritySettings(
  actor: Actor,
  input: unknown,
): Promise<SecuritySettings> {
  if (!can(actor, "admin.security")) throw new ForbiddenError();
  const next = parse(securitySettingsSchema, input);
  const before = await getSecuritySettings();

  await getPrisma().$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: SECURITY_KEY },
      create: { key: SECURITY_KEY, value: next },
      update: { value: next },
    });
    await writeAudit(tx, {
      entityType: "setting",
      entityId: SECURITY_KEY,
      actorId: actor.id,
      action: "updated",
      diff: { from: before, to: next },
    });
  });
  return next;
}

/** Whether this user must enroll in two-factor before reaching the rest of the app. */
export function mustEnrollTwoFactor(
  user: Pick<Actor, "role"> & { twoFactorEnabled: boolean },
  settings: SecuritySettings,
): boolean {
  return settings.requireTwoFactor && user.role !== "requester" && !user.twoFactorEnabled;
}
