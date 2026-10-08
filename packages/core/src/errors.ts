// Errors thrown by core services. The web app maps each kind to a response; message keys
// refer to the web app's message catalog so the text can be translated.

export type FieldErrors = Record<string, string>;

export class CoreError extends Error {
  constructor(
    readonly code: "forbidden" | "not_found" | "conflict" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends CoreError {
  constructor(message = "forbidden") {
    super("forbidden", message);
  }
}

export class NotFoundError extends CoreError {
  constructor(message = "not_found") {
    super("not_found", message);
  }
}

export class ConflictError extends CoreError {
  constructor(
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super("conflict", message);
  }
}

export class ValidationError extends CoreError {
  constructor(
    readonly fieldErrors: FieldErrors,
    message = "invalid",
  ) {
    super("invalid", message);
  }
}
