import type { FaqEntry } from "./faq";

/**
 * Lower-cased and stripped of diacritics, so "metodos" finds "métodos".
 *
 * NFD splits a letter from its accent, and the range strips the combining
 * marks that leaves behind — the whole reason this is not just
 * `toLowerCase()`: this FAQ is authored in Portuguese and read on phone
 * keyboards that make accents an extra tap.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * The FAQ, filtered by what somebody typed — over question and answer both,
 * because people search for the word in the answer ("M-Pesa") as often as
 * for the question.
 *
 * A substring match, not a ranking: twenty entries do not need scoring, and
 * a ranked list whose order changes as you type is harder to read than one
 * that keeps the authored order.
 */
export function searchFaq(entries: readonly FaqEntry[], query: string): FaqEntry[] {
  const needle = fold(query.trim());
  if (needle.length === 0) return [...entries];
  return entries.filter((entry) => fold(`${entry.question} ${entry.answer}`).includes(needle));
}
