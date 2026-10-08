import type { CustomFieldDefView, CustomFieldValue } from "@petey/core";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";
import { Field, Input, Select } from "./ui";

/**
 * Inputs for custom fields. Each one also submits its key in "customKeys", so the server
 * can tell an unticked checkbox ("no") from a field that wasn't on the form at all.
 */
export function CustomFieldInputs({
  defs,
  values = {},
  errors = {},
  prefix = "cf",
  enforceRequired = true,
}: {
  /** Off when editing an existing ticket: required fields are only enforced when raising one. */
  enforceRequired?: boolean;
  defs: CustomFieldDefView[];
  values?: Record<string, CustomFieldValue>;
  errors?: Record<string, string> | undefined;
  prefix?: string;
}) {
  const t = getMessages().customFields;
  return (
    <>
      {defs.map((def) => {
        const id = `${prefix}-${def.key}`;
        const name = `custom.${def.key}`;
        const value = values[def.key] ?? null;
        const error = errorMessage(errors[name]);
        const label = def.required ? `${def.label} *` : def.label;
        const common = {
          id,
          name,
          required: def.required && enforceRequired,
          "aria-invalid": error ? true : undefined,
        };
        return (
          <div key={def.key} data-testid={`custom-${def.key}`}>
            <input type="hidden" name="customKeys" value={def.key} />
            {def.fieldType === "checkbox" ? (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    {...common}
                    defaultChecked={value === true}
                    className="size-4"
                  />
                  {label}
                </label>
                {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
              </div>
            ) : (
              <Field id={id} label={label} error={error}>
                {def.fieldType === "select" ? (
                  <Select {...common} defaultValue={typeof value === "string" ? value : ""}>
                    <option value="">{t.choose}</option>
                    {def.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : def.fieldType === "textarea" ? (
                  <textarea
                    {...common}
                    defaultValue={typeof value === "string" ? value : ""}
                    rows={3}
                    maxLength={10_000}
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                ) : (
                  <Input
                    {...common}
                    type={
                      def.fieldType === "number"
                        ? "number"
                        : def.fieldType === "date"
                          ? "date"
                          : "text"
                    }
                    step={def.fieldType === "number" ? "any" : undefined}
                    maxLength={def.fieldType === "text" ? 2000 : undefined}
                    defaultValue={value === null || typeof value === "boolean" ? "" : String(value)}
                  />
                )}
              </Field>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Shows a stored value for reading. */
export function formatCustomValue(value: CustomFieldValue): string {
  const t = getMessages().customFields;
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? t.yes : t.no;
  return String(value);
}
