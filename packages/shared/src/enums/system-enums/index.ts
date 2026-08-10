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

export type Currency = "MZN" | "USD" | "EUR";
