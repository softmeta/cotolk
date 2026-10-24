import {
  InvalidTransitionError,
  type TranslationState,
  transitionTranslation,
} from "@cotolk/core/internal/translation-state";
import { describe, expect, it } from "vitest";

const SOURCE_HASH = "source-v1";
const missing: TranslationState = {
  forms: null,
  status: "missing",
  origin: null,
  translatedFromHash: null,
};
const hola = { other: "Hola" };

describe("transitionTranslation", () => {
  it("puts an agent submission up for review against the current source", () => {
    expect(
      transitionTranslation(missing, {
        type: "submit",
        forms: hola,
        origin: "agent",
        sourceHash: SOURCE_HASH,
      }),
    ).toEqual({
      kind: "apply",
      state: {
        forms: hola,
        status: "needs_review",
        origin: "agent",
        translatedFromHash: SOURCE_HASH,
      },
    });
  });

  it("lets a person submit and approve in one step, but not an agent", () => {
    const human = transitionTranslation(missing, {
      type: "submit",
      forms: hola,
      origin: "human",
      sourceHash: SOURCE_HASH,
      approve: true,
    });
    expect(human).toMatchObject({
      kind: "apply",
      state: { status: "approved" },
    });

    expect(() =>
      transitionTranslation(missing, {
        type: "submit",
        forms: hola,
        origin: "agent",
        sourceHash: SOURCE_HASH,
        approve: true,
      }),
    ).toThrow(InvalidTransitionError);
  });

  it("keeps a person's translation and files an agent's resubmission as a suggestion", () => {
    const edited: TranslationState = {
      forms: { other: "Hola, amigo" },
      status: "approved",
      origin: "human",
      translatedFromHash: SOURCE_HASH,
    };

    expect(
      transitionTranslation(edited, {
        type: "submit",
        forms: hola,
        origin: "agent",
        sourceHash: SOURCE_HASH,
      }),
    ).toEqual({ kind: "suggest" });
  });

  it("approves and rejects only translations that are waiting for review", () => {
    const waiting: TranslationState = {
      forms: hola,
      status: "needs_review",
      origin: "agent",
      translatedFromHash: SOURCE_HASH,
    };

    expect(
      transitionTranslation(waiting, {
        type: "review",
        decision: "approve",
        sourceHash: SOURCE_HASH,
      }),
    ).toMatchObject({ kind: "apply", state: { status: "approved" } });
    expect(
      transitionTranslation(waiting, {
        type: "review",
        decision: "reject",
        sourceHash: SOURCE_HASH,
      }),
    ).toMatchObject({
      kind: "apply",
      state: { status: "rejected", forms: hola },
    });
    for (const decision of ["approve", "reject"] as const) {
      expect(() =>
        transitionTranslation(missing, {
          type: "review",
          decision,
          sourceHash: SOURCE_HASH,
        }),
      ).toThrow(InvalidTransitionError);
    }
  });

  it("marks a translation stale when its source changes and lets review confirm it", () => {
    const approved: TranslationState = {
      forms: hola,
      status: "approved",
      origin: "human",
      translatedFromHash: SOURCE_HASH,
    };

    const stale = transitionTranslation(approved, {
      type: "sourceChanged",
      sourceHash: "source-v2",
    });
    expect(stale).toEqual({
      kind: "apply",
      state: { ...approved, status: "stale" },
    });
    expect(
      transitionTranslation(approved, {
        type: "sourceChanged",
        sourceHash: SOURCE_HASH,
      }),
    ).toEqual({ kind: "unchanged" });
    expect(
      transitionTranslation(missing, {
        type: "sourceChanged",
        sourceHash: "source-v2",
      }),
    ).toEqual({ kind: "unchanged" });

    if (stale.kind !== "apply") throw new Error("expected stale");
    expect(
      transitionTranslation(stale.state, {
        type: "review",
        decision: "approve",
        sourceHash: "source-v2",
      }),
    ).toEqual({
      kind: "apply",
      state: {
        ...approved,
        status: "approved",
        translatedFromHash: "source-v2",
      },
    });
  });

  it("lets an agent replace its own or a stale translation", () => {
    const staleHuman: TranslationState = {
      forms: { other: "Hola, amigo" },
      status: "stale",
      origin: "human",
      translatedFromHash: SOURCE_HASH,
    };

    expect(
      transitionTranslation(staleHuman, {
        type: "submit",
        forms: hola,
        origin: "agent",
        sourceHash: "source-v2",
      }),
    ).toMatchObject({
      kind: "apply",
      state: { status: "needs_review", origin: "agent" },
    });
  });
});
