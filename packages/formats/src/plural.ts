export const PLURAL_CATEGORIES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export type PluralForms = Partial<Record<PluralCategory, string>>;

export function isPluralCategory(value: string): value is PluralCategory {
  return PLURAL_CATEGORIES.some((category) => category === value);
}

export function pluralCategoriesFor(locale: string): PluralCategory[] {
  const needed = new Set(
    new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
  );
  return PLURAL_CATEGORIES.filter((category) => needed.has(category));
}
