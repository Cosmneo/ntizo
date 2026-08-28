const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * `"2025-03"` as "março de 2025", in the reader's language.
 *
 * Built at UTC midday and formatted in UTC. `new Date("2025-01")` is parsed as
 * a UTC instant but formatted in the device's zone, so a reader west of
 * Greenwich would be told a business joined in December 2024 — off by a month,
 * every January, only for some people.
 *
 * Returns null rather than throwing or rendering "Invalid Date": the caller
 * renders nothing at all for a value it cannot read, which is the honest
 * outcome for a fact that failed to arrive.
 */
export function formatMemberSince(value: string | null, locale: string): string | null {
  if (!value) return null;
  const match = YEAR_MONTH.exec(value);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
