import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import {
  applicableFields,
  validateCustomFieldValues,
  type CustomFieldDefView,
} from "./custom-fields";

const def = (
  overrides: Partial<CustomFieldDefView> & Pick<CustomFieldDefView, "key" | "fieldType">,
): CustomFieldDefView => ({
  id: overrides.key,
  label: overrides.key,
  options: [],
  appliesTo: "all",
  required: false,
  visibleToRequesters: true,
  sortOrder: 0,
  isActive: true,
  ...overrides,
});

const defs = [
  def({ key: "asset_tag", fieldType: "text", required: true }),
  def({ key: "notes", fieldType: "textarea" }),
  def({ key: "seats", fieldType: "number" }),
  def({ key: "needed_by", fieldType: "date", appliesTo: "request" }),
  def({ key: "office", fieldType: "select", options: ["London", "Leeds"] }),
  def({ key: "agree", fieldType: "checkbox" }),
  def({ key: "internal_code", fieldType: "text", visibleToRequesters: false }),
  def({ key: "retired", fieldType: "text", isActive: false }),
];

function errorsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err.fieldErrors;
    throw err;
  }
  return {};
}

describe("applicableFields", () => {
  it("drops inactive fields and those for the other ticket type", () => {
    expect(
      applicableFields(defs, { ticketType: "incident", forRequester: false }).map((d) => d.key),
      // Equal sort order, so alphabetical by label.
    ).toEqual(["agree", "asset_tag", "internal_code", "notes", "office", "seats"]);
    expect(
      applicableFields(defs, { ticketType: "request", forRequester: false }).map((d) => d.key),
    ).toContain("needed_by");
  });

  it("hides technician-only fields from requesters", () => {
    expect(
      applicableFields(defs, { ticketType: "incident", forRequester: true }).map((d) => d.key),
    ).not.toContain("internal_code");
  });
});

describe("validateCustomFieldValues", () => {
  const ctx = { ticketType: "request" as const, forRequester: false, enforceRequired: true };

  it("coerces form strings to typed values and blanks to null", () => {
    expect(
      validateCustomFieldValues(
        defs,
        {
          asset_tag: "  LT-0042 ",
          notes: "",
          seats: "3",
          needed_by: "2026-11-01",
          office: "Leeds",
          agree: "on",
          internal_code: "X1",
        },
        ctx,
      ),
    ).toEqual({
      asset_tag: "LT-0042",
      notes: null,
      seats: 3,
      needed_by: "2026-11-01",
      office: "Leeds",
      agree: true,
      internal_code: "X1",
    });
  });

  it("accepts already-typed values from the API", () => {
    expect(
      validateCustomFieldValues(defs, { asset_tag: "A", seats: 2.5, agree: false }, ctx),
    ).toMatchObject({
      seats: 2.5,
      agree: false,
    });
  });

  it("treats a missing checkbox as unchecked", () => {
    expect(validateCustomFieldValues(defs, { asset_tag: "A" }, ctx).agree).toBe(false);
  });

  it.each([
    [{ asset_tag: "" }, { "custom.asset_tag": "required" }],
    [{ asset_tag: "   " }, { "custom.asset_tag": "required" }],
    [{ asset_tag: "A", seats: "three" }, { "custom.seats": "invalid_number" }],
    [{ asset_tag: "A", seats: "1e400" }, { "custom.seats": "invalid_number" }],
    [{ asset_tag: "A", needed_by: "2026-02-30" }, { "custom.needed_by": "invalid_date" }],
    [{ asset_tag: "A", needed_by: "01/11/2026" }, { "custom.needed_by": "invalid_date" }],
    [{ asset_tag: "A", office: "Paris" }, { "custom.office": "invalid_option" }],
    [{ asset_tag: "x".repeat(2001) }, { "custom.asset_tag": "too_long" }],
    [{ asset_tag: "A", agree: "maybe" }, { "custom.agree": "invalid" }],
  ])("rejects %j", (input, expected) => {
    expect(errorsOf(() => validateCustomFieldValues(defs, input, ctx))).toEqual(expected);
  });

  it("reports every bad field at once", () => {
    expect(
      Object.keys(
        errorsOf(() => validateCustomFieldValues(defs, { seats: "x", office: "Paris" }, ctx)),
      ).sort(),
    ).toEqual(["custom.asset_tag", "custom.office", "custom.seats"]);
  });

  it("requires a required checkbox to be ticked", () => {
    const consent = [def({ key: "consent", fieldType: "checkbox", required: true })];
    expect(errorsOf(() => validateCustomFieldValues(consent, {}, ctx))).toEqual({
      "custom.consent": "required",
    });
    expect(validateCustomFieldValues(consent, { consent: "true" }, ctx)).toEqual({ consent: true });
  });

  it("skips required checks when asked, e.g. editing a ticket created before a field existed", () => {
    expect(validateCustomFieldValues(defs, {}, { ...ctx, enforceRequired: false })).toMatchObject({
      asset_tag: null,
    });
  });

  it("ignores unknown keys, inactive fields, other-type fields and, for requesters, technician-only fields", () => {
    const values = validateCustomFieldValues(
      defs,
      {
        asset_tag: "A",
        retired: "old",
        made_up: "x",
        needed_by: "2026-11-01",
        internal_code: "sneaky",
      },
      { ticketType: "incident", forRequester: true, enforceRequired: true },
    );
    expect(Object.keys(values).sort()).toEqual(["agree", "asset_tag", "notes", "office", "seats"]);
  });
});
