import "server-only";
import {
  can,
  getSecuritySettings,
  getSessionUser,
  mustEnrollTwoFactor,
  type Role,
  type SessionUser,
} from "@petey/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export type Area = "portal" | "agent" | "admin";

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "technician" ? "/agent" : "/portal";
}

/** The signed-in user for this request, or null. Cached for the duration of a request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getSessionUser(await headers());
});

/** Requires a signed-in user; sends everyone else to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Guards an area of the app. Signed-out visitors go to sign-in; staff who must enroll in
 * two-factor go to account security; users without access go to their own home.
 */
export async function requireArea(area: Area): Promise<SessionUser> {
  const user = await requireUser();
  if (mustEnrollTwoFactor(user, await getSecuritySettings())) {
    redirect("/account/security?required=1");
  }
  if (!can(user, `area.${area}`)) redirect(homePathFor(user.role));
  return user;
}
