// Shared by server actions and the client forms that call them.

/** What a server action returns to a form using useActionState. */
export interface ActionState {
  ok?: boolean;
  /** Error code, translated by errorMessage() in the form. */
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the action succeeded and the form should show a message. */
  message?: string;
}

export const initialState: ActionState = {};
