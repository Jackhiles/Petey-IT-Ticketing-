// Every permission check in Petey goes through `can()`. v1 has three fixed roles; custom
// roles can replace the table below later without touching call sites.

export type Role = "requester" | "technician" | "admin";

/** The signed-in user as permission checks see them. */
export interface Actor {
  id: string;
  role: Role;
  isActive: boolean;
}

/** Optional context for actions that depend on who owns the thing being acted on. */
export interface Resource {
  ownerId?: string | null;
}

const ALL: readonly Role[] = ["requester", "technician", "admin"];
const STAFF: readonly Role[] = ["technician", "admin"];
const ADMIN: readonly Role[] = ["admin"];

const RULES = {
  // Areas of the web app
  "area.portal": ALL,
  "area.agent": STAFF,
  "area.admin": ADMIN,

  // Tickets
  "ticket.create": ALL,
  "ticket.viewOwn": ALL,
  "ticket.replyOwn": ALL,
  "ticket.rate": ALL,
  "ticket.viewAll": STAFF,
  "ticket.work": STAFF,
  "ticket.addInternalNote": STAFF,
  "ticket.mergeSplitLink": STAFF,
  "ticket.logTime": STAFF,
  "cannedResponse.usePersonal": STAFF,
  "macro.usePersonal": STAFF,

  // Knowledge base
  "kb.readPublic": ALL,
  "kb.readInternal": STAFF,
  "kb.write": STAFF,

  // Assets and reports
  "asset.view": STAFF,
  "asset.edit": STAFF,
  "report.view": STAFF,
  "report.manage": STAFF,

  // API
  "apiToken.createOwn": STAFF,

  // Administration
  "admin.users": ADMIN,
  "admin.groups": ADMIN,
  "admin.categories": ADMIN,
  "admin.statuses": ADMIN,
  "admin.customFields": ADMIN,
  "admin.sla": ADMIN,
  "admin.automation": ADMIN,
  "admin.mailboxes": ADMIN,
  "admin.templates": ADMIN,
  "admin.sharedResponses": ADMIN,
  "admin.tags": ADMIN,
  "admin.surveySettings": ADMIN,
  "admin.security": ADMIN,
  "admin.import": ADMIN,
  "auditLog.read": ADMIN,

  // Own account
  "account.manageOwn": ALL,
  "twoFactor.enroll": STAFF,
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof RULES;
export const ACTIONS = Object.keys(RULES) as Action[];

/** Actions a requester may take only on resources they own. Staff may take them on any. */
const OWNER_SCOPED: ReadonlySet<Action> = new Set([
  "ticket.viewOwn",
  "ticket.replyOwn",
  "ticket.rate",
]);

export function can(actor: Actor | null | undefined, action: Action, resource?: Resource): boolean {
  if (!actor || !actor.isActive) return false;
  const roles: readonly Role[] = RULES[action];
  if (!roles.includes(actor.role)) return false;

  if (OWNER_SCOPED.has(action) && actor.role === "requester" && resource) {
    return resource.ownerId === actor.id;
  }
  return true;
}
