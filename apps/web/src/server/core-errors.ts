import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyAttemptsError,
  UnauthenticatedError,
  ValidationError,
} from "@cotolk/core";
import { notFound, redirect } from "@tanstack/react-router";
import { setResponseStatus } from "@tanstack/react-start/server";

const STATUS = new Map<new (...args: never[]) => Error, number>([
  [ForbiddenError, 403],
  [ConflictError, 409],
  [ValidationError, 422],
  [TooManyAttemptsError, 429],
]);

export async function withCoreErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw redirect({ to: "/login" });
    }
    if (error instanceof NotFoundError) {
      throw notFound();
    }
    for (const [type, status] of STATUS) {
      if (error instanceof type) {
        setResponseStatus(status);
        throw new Error(error.message);
      }
    }
    throw error;
  }
}
