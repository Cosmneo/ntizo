// This file sits at bounded-contexts/notification/infrastructure/templates/ —
// the same depth as infrastructure/repositories/drizzle/ — so reaching
// packages/backend/src/shared takes six `../` segments, not five: templates ->
// infrastructure -> notification -> bounded-contexts -> ntizo -> modules -> src.
import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";

/**
 * The eight this platform ships. Kept here rather than imported from the
 * frontend's i18n config: the backend must not depend on a bundle it never
 * loads, and this list changing is a deliberate act in both places.
 */
export const TEMPLATE_LOCALES = [
  "en-US", "pt-MZ", "pt-PT", "es-ES", "fr-FR", "it-IT", "de-DE", "nl-NL",
] as const;

export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

/**
 * Picks the copy for a locale, falling back to English.
 *
 * Two fallbacks, in order: an exact match, then the language without its
 * region — so a `pt-BR` we do not ship still reads Portuguese rather than
 * English. Only then English. A Mozambican reader getting Brazilian
 * Portuguese is a much smaller failure than getting a language they may not
 * read at all.
 */
export function pickCopy<T>(byLocale: Record<string, T>, locale: string): T {
  const exact = byLocale[locale];
  if (exact) return exact;

  const language = locale.split("-")[0];
  const sameLanguage = Object.entries(byLocale).find(([k]) => k.split("-")[0] === language);
  if (sameLanguage) return sameLanguage[1];

  return byLocale["en-US"]!;
}

/** Every template module exports exactly this. */
export interface TemplateModule {
  render(
    locale: string,
    payload: Record<string, unknown>,
  ): { subject: string; html: string; text: string };
}

/**
 * Escapes what goes into an HTML email body.
 *
 * A provider names their own business and a person types their own first
 * name; both reach a template through the notification's payload. An
 * apostrophe would merely look wrong, but a `<` would not, and an email body
 * is markup like any other.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Where a link in an email should point.
 *
 * `APP_URL` is a per-request Worker binding, so this must be called inside a
 * request — every send is. Falls back to the local dev origin so a console
 * send is still clickable.
 */
export function appBaseUrl(): string {
  const env = infraStore.getEnv();
  return env.APP_URL ?? "http://localhost:3000";
}
