import "server-only";
import { CoreError, ValidationError, type FieldErrors } from "@petey/core";
import type { ActionState } from "./action-state";

export type { ActionState } from "./action-state";

/**
 * Runs a core service call and turns known core errors into form state. Unknown errors
 * are rethrown so Next.js shows its error page and logs them. Call redirect() after this
 * returns, never inside it, because redirect works by throwing.
 */
export async function runAction(
  fn: () => Promise<unknown>,
  message?: string,
): Promise<ActionState> {
  try {
    await fn();
    return message ? { ok: true, message } : { ok: true };
  } catch (err) {
    if (err instanceof ValidationError) return { error: "invalid", fieldErrors: err.fieldErrors };
    if (err instanceof CoreError) {
      const fieldErrors = "fieldErrors" in err ? (err.fieldErrors as FieldErrors) : undefined;
      return fieldErrors && Object.keys(fieldErrors).length > 0
        ? { error: err.message, fieldErrors }
        : { error: err.message };
    }
    throw err;
  }
}

/** Reads a form field as a string ("" when missing). */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
