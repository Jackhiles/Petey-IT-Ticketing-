"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { initialState, type ActionState } from "@/lib/action-state";
import { getMessages } from "@/messages";
import { errorMessage } from "@/messages/en";

const ROLES = ["requester", "technician", "admin"] as const;

export interface UserFormValues {
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  departmentId: string | null;
  isActive: boolean;
}

/** Create and edit form for a user. On create it also asks for the initial password. */
export function UserForm({
  action,
  departments,
  values,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  departments: { id: string; name: string }[];
  values?: UserFormValues;
}) {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(action, initialState);
  const err = (name: string) => errorMessage(state.fieldErrors?.[name]);
  const isNew = !values;

  return (
    <form action={formAction} className="space-y-4">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{errorMessage(state.error)}</Alert>}
      <Field id="name" label={t.common.name} error={err("name")}>
        <Input id="name" name="name" defaultValue={values?.name} required />
      </Field>
      <Field id="email" label={t.common.email} error={err("email")}>
        <Input id="email" name="email" type="email" defaultValue={values?.email} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="role" label={t.common.role} error={err("role")}>
          <Select id="role" name="role" defaultValue={values?.role ?? "requester"}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="departmentId" label={t.users.department} error={err("departmentId")}>
          <Select id="departmentId" name="departmentId" defaultValue={values?.departmentId ?? ""}>
            <option value="">{t.common.none}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {isNew ? (
        <Field
          id="password"
          label={t.users.initialPassword}
          error={err("password")}
          hint={t.errors.password_too_short}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
      ) : (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={values.isActive}
              className="size-4"
            />
            {t.users.accountActive}
          </label>
          <p className="mt-1 text-xs text-zinc-500">{t.users.accountActiveHint}</p>
          {err("isActive") && <p className="mt-1 text-sm text-red-600">{err("isActive")}</p>}
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t.common.working : isNew ? t.common.create : t.common.save}
      </Button>
    </form>
  );
}
