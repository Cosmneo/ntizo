import { z } from "zod";

export type Theme = "light" | "dark" | "system";

/**
 * The locales the product ships, as one list both sides read.
 *
 * A `const` array rather than a bare union type: the API's zod schema needs
 * the values at runtime to validate against, and deriving them here is what
 * stops the two drifting. They already had — the type carried three locales
 * while the web app shipped eight, so anyone who chose Deutsch in the header
 * could not have it saved to their profile.
 */
export const LOCALES = [
  "pt-MZ",
  "pt-PT",
  "en-US",
  "es-ES",
  "de-DE",
  "fr-FR",
  "it-IT",
  "nl-NL",
] as const;

export const localeSchema = z.enum(LOCALES);

export type Locale = (typeof LOCALES)[number];

/**
 * The locale everything falls back to.
 *
 * Content an administrator writes — a category name, and whatever follows it —
 * is required in this locale and optional in the rest, so a reader whose
 * language has no translation yet gets a real word instead of a blank or a
 * key. First in `LOCALES` on purpose: the two must not disagree about which
 * language the product speaks by default.
 *
 * A constant rather than a platform setting. Every read of translated content
 * needs it, and making it a setting would put a second query in front of each
 * one to answer a question that changes roughly never.
 */
export const DEFAULT_LOCALE: Locale = LOCALES[0];

export type Currency = "MZN" | "USD" | "EUR";
export * from "./resolve-locale";
