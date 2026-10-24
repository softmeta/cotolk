import { z } from "zod";

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, {
    message:
      "Use 1-64 lowercase letters, digits, or hyphens, starting and ending with a letter or digit",
  });

export const nameSchema = z.string().trim().min(1).max(200);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(15).max(256);

export const localeSchema = z.string().transform((value, context) => {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (canonical) {
      return canonical;
    }
  } catch {}
  context.addIssue({ code: "custom", message: `Invalid locale: ${value}` });
  return z.NEVER;
});
