import { createHash } from "node:crypto";
import type { Forms } from "@cotolk/db";
import { z } from "zod";
import { ValidationError } from "./errors";

export const formsSchema = z.record(z.string(), z.string());

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

export function canonicalForms(forms: Forms): Forms {
  return Object.fromEntries(
    PLURAL_CATEGORIES.filter((category) => category in forms).map(
      (category) => [category, forms[category] ?? ""],
    ),
  );
}

export function sourceHash(plural: boolean, forms: Forms) {
  return createHash("sha256")
    .update(JSON.stringify({ plural, forms: canonicalForms(forms) }))
    .digest("hex");
}

export function requiredCategories(plural: boolean, locale: string) {
  if (!plural) {
    return ["other"];
  }
  const needed = new Set<string>(
    new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
  );
  return PLURAL_CATEGORIES.filter((category) => needed.has(category));
}

export function validateForms(plural: boolean, locale: string, forms: Forms) {
  const required = requiredCategories(plural, locale);
  const given = Object.keys(forms);
  const missing = required.filter((category) => !(category in forms));
  const extra = given.filter((category) => !required.includes(category));
  if (missing.length > 0 || extra.length > 0) {
    throw new ValidationError(
      `${locale} needs forms ${required.join(", ")}; missing ${missing.join(", ") || "none"}, unexpected ${extra.join(", ") || "none"}`,
    );
  }
  return canonicalForms(forms);
}
