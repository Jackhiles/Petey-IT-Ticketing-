import type { z } from "zod";
import { ValidationError, type FieldErrors } from "./errors";

/** Parses input with a Zod schema, throwing a ValidationError keyed by field path. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  throw new ValidationError(fieldErrors);
}
