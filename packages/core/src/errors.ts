export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Not allowed to ${action}`);
  }
}

export class ConflictError extends Error {}

export class ValidationError extends Error {}

export class UnauthenticatedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
  }
}

export class TooManyAttemptsError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Too many failed sign-in attempts; try again later");
  }
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
