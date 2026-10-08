import { getPrisma, type Prisma } from "@petey/db";
import { z } from "zod";
import { diffFields, writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { can, type Actor } from "./permissions";
import { parse } from "./validation";

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type CustomFieldValue = string | number | boolean | null;

export interface CustomFieldDefView {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  appliesTo: "all" | "incident" | "request";
  required: boolean;
  visibleToRequesters: boolean;
  sortOrder: number;
  isActive: boolean;
}

const MAX_LENGTH: Record<CustomFieldType, number> = {
  text: 2000,
  textarea: 10_000,
  number: 0,
  date: 0,
  select: 0,
  checkbox: 0,
};

// --- Validation (pure) ------------------------------------------------------------------

/** The fields that apply to a ticket of this type, for this audience, in display order. */
export function applicableFields(
  defs: CustomFieldDefView[],
  ctx: { ticketType: "incident" | "request"; forRequester: boolean },
): CustomFieldDefView[] {
  return defs
    .filter((d) => d.isActive)
    .filter((d) => d.appliesTo === "all" || d.appliesTo === ctx.ticketType)
    .filter((d) => !ctx.forRequester || d.visibleToRequesters)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Turns one raw value (a form string or an API value) into a typed value, or an error code. */
function coerce(
  def: CustomFieldDefView,
  raw: unknown,
): { value: CustomFieldValue } | { error: string } {
  if (def.fieldType === "checkbox") {
    if (
      raw === undefined ||
      raw === null ||
      raw === "" ||
      raw === false ||
      raw === "false" ||
      raw === "off"
    ) {
      return { value: false };
    }
    if (raw === true || raw === "true" || raw === "on" || raw === "1") return { value: true };
    return { error: "invalid" };
  }
  if (raw === undefined || raw === null) return { value: null };
  if (def.fieldType === "number") {
    if (typeof raw === "number")
      return Number.isFinite(raw) ? { value: raw } : { error: "invalid_number" };
    const text = String(raw).trim();
    if (text === "") return { value: null };
    const n = Number(text);
    return Number.isFinite(n) ? { value: n } : { error: "invalid_number" };
  }
  const text = String(raw).trim();
  if (text === "") return { value: null };
  switch (def.fieldType) {
    case "date":
      return isValidDate(text) ? { value: text } : { error: "invalid_date" };
    case "select":
      return def.options.includes(text) ? { value: text } : { error: "invalid_option" };
    default:
      return text.length > MAX_LENGTH[def.fieldType] ? { error: "too_long" } : { value: text };
  }
}

/**
 * Validates custom field input for a ticket. Returns a value (or null) for every applicable
 * field and drops anything else. Errors are keyed "custom.<key>" and reported together.
 */
export function validateCustomFieldValues(
  defs: CustomFieldDefView[],
  input: Record<string, unknown>,
  ctx: { ticketType: "incident" | "request"; forRequester: boolean; enforceRequired: boolean },
): Record<string, CustomFieldValue> {
  const values: Record<string, CustomFieldValue> = {};
  const errors: Record<string, string> = {};
  for (const def of applicableFields(defs, ctx)) {
    const result = coerce(def, input[def.key]);
    if ("error" in result) {
      errors[`custom.${def.key}`] = result.error;
      continue;
    }
    const empty = result.value === null || result.value === false;
    if (ctx.enforceRequired && def.required && empty) {
      errors[`custom.${def.key}`] = "required";
      continue;
    }
    values[def.key] = result.value;
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return values;
}

// --- Definitions ------------------------------------------------------------------------

const optionsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100)
  .refine((o) => new Set(o).size === o.length, { message: "duplicate_options" });

export const customFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, { message: "invalid_key" }),
  label: z.string().trim().min(1, { message: "required" }).max(100),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  options: optionsSchema.default([]),
  appliesTo: z.enum(["all", "incident", "request"]).default("all"),
  required: z.boolean().default(false),
  visibleToRequesters: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
});

/** key and fieldType are fixed once created: stored values depend on them. */
export const updateCustomFieldSchema = customFieldSchema.omit({ key: true, fieldType: true });

function toView(row: {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: Prisma.JsonValue;
  appliesTo: "all" | "incident" | "request";
  required: boolean;
  visibleToRequesters: boolean;
  sortOrder: number;
  isActive: boolean;
}): CustomFieldDefView {
  return { ...row, options: z.array(z.string()).catch([]).parse(row.options) };
}

/** Every definition, including inactive ones, in display order. */
export async function listCustomFields(): Promise<CustomFieldDefView[]> {
  const rows = await getPrisma().customFieldDef.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toView);
}

function requireAdmin(actor: Actor): void {
  if (!can(actor, "admin.customFields")) throw new ForbiddenError();
}

function checkOptions(fieldType: CustomFieldType, options: string[]): void {
  if (fieldType === "select" && options.length === 0)
    throw new ValidationError({ options: "options_required" });
}

export async function createCustomField(actor: Actor, input: unknown): Promise<string> {
  requireAdmin(actor);
  const data = parse(customFieldSchema, input);
  checkOptions(data.fieldType, data.options);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const row = await tx.customFieldDef.create({
        data: { ...data, options: data.fieldType === "select" ? data.options : [] },
      });
      await writeAudit(tx, {
        entityType: "custom_field",
        entityId: row.id,
        actorId: actor.id,
        action: "created",
        diff: { key: data.key, label: data.label, fieldType: data.fieldType },
      });
      return row.id;
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      throw new ConflictError("key_taken", { key: "key_taken" });
    }
    throw err;
  }
}

export async function updateCustomField(actor: Actor, id: string, input: unknown): Promise<void> {
  requireAdmin(actor);
  const data = parse(updateCustomFieldSchema, input);
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.customFieldDef.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    checkOptions(before.fieldType, data.options);
    const next = { ...data, options: before.fieldType === "select" ? data.options : [] };
    const diff = diffFields(
      { ...before, options: JSON.stringify(before.options) },
      { ...next, options: JSON.stringify(next.options) },
    );
    if (Object.keys(diff).length === 0) return;
    await tx.customFieldDef.update({ where: { id }, data: next });
    await writeAudit(tx, {
      entityType: "custom_field",
      entityId: id,
      actorId: actor.id,
      action: "updated",
      diff,
    });
  });
}
