import type { Forms, TranslationOrigin, TranslationStatus } from "@cotolk/db";

export interface TranslationState {
  forms: Forms | null;
  status: TranslationStatus;
  origin: TranslationOrigin | null;
  translatedFromHash: string | null;
}

export type TranslationEvent =
  | {
      type: "submit";
      forms: Forms;
      origin: TranslationOrigin;
      sourceHash: string;
      approve?: boolean;
    }
  | { type: "review"; decision: "approve" | "reject"; sourceHash: string }
  | { type: "sourceChanged"; sourceHash: string };

export type TranslationTransition =
  | { kind: "apply"; state: TranslationState }
  | { kind: "suggest" }
  | { kind: "unchanged" };

export class InvalidTransitionError extends Error {}

const REVIEWABLE: ReadonlySet<TranslationStatus> = new Set([
  "needs_review",
  "stale",
  "rejected",
]);

function keepsHumanTranslation(
  current: TranslationState,
  origin: TranslationOrigin,
) {
  return (
    origin !== "human" &&
    current.origin === "human" &&
    current.forms !== null &&
    current.status !== "stale"
  );
}

function submit(
  current: TranslationState,
  event: Extract<TranslationEvent, { type: "submit" }>,
): TranslationTransition {
  if (event.approve && event.origin !== "human") {
    throw new InvalidTransitionError("Only a person can approve a translation");
  }
  if (keepsHumanTranslation(current, event.origin)) {
    return { kind: "suggest" };
  }
  return {
    kind: "apply",
    state: {
      forms: event.forms,
      status: event.approve ? "approved" : "needs_review",
      origin: event.origin,
      translatedFromHash: event.sourceHash,
    },
  };
}

function review(
  current: TranslationState,
  event: Extract<TranslationEvent, { type: "review" }>,
): TranslationTransition {
  if (current.forms === null || !REVIEWABLE.has(current.status)) {
    throw new InvalidTransitionError(
      `Cannot ${event.decision} a translation that is ${current.status}`,
    );
  }
  if (event.decision === "reject") {
    return { kind: "apply", state: { ...current, status: "rejected" } };
  }
  return {
    kind: "apply",
    state: {
      ...current,
      status: "approved",
      translatedFromHash: event.sourceHash,
    },
  };
}

function sourceChanged(
  current: TranslationState,
  sourceHash: string,
): TranslationTransition {
  if (
    current.forms === null ||
    current.status === "stale" ||
    current.translatedFromHash === sourceHash
  ) {
    return { kind: "unchanged" };
  }
  return { kind: "apply", state: { ...current, status: "stale" } };
}

export function transitionTranslation(
  current: TranslationState,
  event: TranslationEvent,
): TranslationTransition {
  switch (event.type) {
    case "submit":
      return submit(current, event);
    case "review":
      return review(current, event);
    case "sourceChanged":
      return sourceChanged(current, event.sourceHash);
  }
}
