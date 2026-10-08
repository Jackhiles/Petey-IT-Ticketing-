import { describe, expect, it } from "vitest";
import { ACTIONS, can, type Action, type Actor } from "./permissions";

// The "Roles and permissions" table from docs/PLAN.md, one row per action.
// [requester, technician, admin]
const MATRIX: Record<Action, [boolean, boolean, boolean]> = {
  "area.portal": [true, true, true],
  "area.agent": [false, true, true],
  "area.admin": [false, false, true],

  "ticket.create": [true, true, true],
  "ticket.viewOwn": [true, true, true],
  "ticket.replyOwn": [true, true, true],
  "ticket.rate": [true, true, true],
  "ticket.viewAll": [false, true, true],
  "ticket.work": [false, true, true],
  "ticket.addInternalNote": [false, true, true],
  "ticket.mergeSplitLink": [false, true, true],
  "ticket.logTime": [false, true, true],
  "cannedResponse.usePersonal": [false, true, true],
  "macro.usePersonal": [false, true, true],

  "kb.readPublic": [true, true, true],
  "kb.readInternal": [false, true, true],
  "kb.write": [false, true, true],

  "asset.view": [false, true, true],
  "asset.edit": [false, true, true],

  "report.view": [false, true, true],
  "report.manage": [false, true, true],

  "apiToken.createOwn": [false, true, true],

  "admin.users": [false, false, true],
  "admin.groups": [false, false, true],
  "admin.categories": [false, false, true],
  "admin.statuses": [false, false, true],
  "admin.priorities": [false, false, true],
  "admin.ticketSettings": [false, false, true],
  "admin.customFields": [false, false, true],
  "admin.sla": [false, false, true],
  "admin.automation": [false, false, true],
  "admin.mailboxes": [false, false, true],
  "admin.templates": [false, false, true],
  "admin.sharedResponses": [false, false, true],
  "admin.tags": [false, false, true],
  "admin.surveySettings": [false, false, true],
  "admin.security": [false, false, true],
  "admin.import": [false, false, true],
  "auditLog.read": [false, false, true],

  "account.manageOwn": [true, true, true],
  "twoFactor.enroll": [false, true, true],
};

const actor = (role: Actor["role"], overrides: Partial<Actor> = {}): Actor => ({
  id: `${role}-id`,
  role,
  isActive: true,
  ...overrides,
});

const ROLES = ["requester", "technician", "admin"] as const;

describe("can", () => {
  it("covers every action in the matrix and nothing else", () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  for (const [action, allowed] of Object.entries(MATRIX) as [Action, boolean[]][]) {
    ROLES.forEach((role, i) => {
      it(`${role} ${allowed[i] ? "may" : "may not"} ${action}`, () => {
        expect(can(actor(role), action)).toBe(allowed[i]);
      });
    });
  }

  it("denies every action to an inactive user, whatever the role", () => {
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        expect(can(actor(role, { isActive: false }), action)).toBe(false);
      }
    }
  });

  it("denies every action when there is no signed-in user", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
    }
  });

  describe("own-resource actions", () => {
    const ownActions = ["ticket.viewOwn", "ticket.replyOwn", "ticket.rate"] as const;

    it("lets a requester act on a resource they own", () => {
      for (const action of ownActions) {
        expect(can(actor("requester"), action, { ownerId: "requester-id" })).toBe(true);
      }
    });

    it("stops a requester acting on someone else's resource", () => {
      for (const action of ownActions) {
        expect(can(actor("requester"), action, { ownerId: "someone-else" })).toBe(false);
      }
    });

    it("lets technicians and admins act on any requester's resource", () => {
      for (const role of ["technician", "admin"] as const) {
        for (const action of ownActions) {
          expect(can(actor(role), action, { ownerId: "someone-else" })).toBe(true);
        }
      }
    });
  });
});
