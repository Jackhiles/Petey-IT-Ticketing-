import type { Prisma, Tx } from "@petey/db";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  diff?: Prisma.InputJsonValue;
}

/** Writes an audit row. Call it inside the same transaction as the change it records. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorId: entry.actorId,
      action: entry.action,
      diff: entry.diff ?? {},
    },
  });
}

type JsonScalar = string | number | boolean | null;

function toJson(value: unknown): JsonScalar {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  return String(value);
}

/** Builds a `{ field: { from, to } }` diff for the fields that actually changed. */
export function diffFields<T extends object>(
  before: T,
  after: Partial<T>,
): Record<string, { from: JsonScalar; to: JsonScalar }> {
  const diff: Record<string, { from: JsonScalar; to: JsonScalar }> = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    const to = after[key];
    if (to !== undefined && toJson(to) !== toJson(before[key])) {
      diff[key] = { from: toJson(before[key]), to: toJson(to) };
    }
  }
  return diff;
}
