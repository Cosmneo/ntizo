import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/**
 * The accents names in the launch markets carry — Portuguese, Spanish and
 * French — and what each one folds to. **Both folds below read this one pair**,
 * character for character, so a needle and a column can never be folded
 * differently.
 *
 * That is the whole point of the pair being declared once, and it is not
 * theoretical. These two folds were written independently at first: the SQL
 * side listed 23 characters and the JS side stripped every Unicode combining
 * mark via `normalize("NFD")`. `ñ` is a combining mark in NFD and was *not* in
 * the 23, so the JS side over-stripped: a provider searching a customer named
 * "Nuño" folded the needle to "nuno" while the column stayed "nuño", and the
 * search missed the row — whether they typed the name exactly as it is spelled
 * or without the tilde. "Peña" and "Muñoz" the same. Two alphabets that are
 * *nearly* the same produce silent false negatives on precisely the names
 * whose spelling made somebody reach for the search box.
 *
 * A character outside this pair is left alone by both sides, which is a miss
 * the two agree on rather than a disagreement: an exactly-typed name still
 * finds its own row. Widening the alphabet is a matter of adding to both
 * strings together, and they must stay the same length.
 *
 * Here, in the shared database layer, rather than in the booking read
 * repository where it was born: the admin's support and activity lists now
 * search the same way, and a second alphabet in a second file is the
 * disagreement above waiting to happen again.
 */
const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçñýÿ";
const PLAIN = "aaaaaeeeeiiiiooooouuuucnyy";

/** `ACCENTED` → `PLAIN`, one character to one, for the JS side of the fold. */
const FOLD: ReadonlyMap<string, string> = new Map(
  [...ACCENTED].map((accented, i) => [accented, PLAIN[i]!] as const),
);

/**
 * The column (or expression), lowercased and folded through `ACCENTED`/`PLAIN`
 * by Postgres itself. `unaccent` is a contrib extension this database does
 * not have; `translate` needs none, and takes the same alphabet the needle is
 * folded with as two ordinary bind parameters.
 */
export function unaccented(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`;
}

/**
 * The needle, folded through the same pair — never `normalize("NFD")`, which
 * would strip marks `translate` keeps and put the two sides back into
 * different alphabets. See `ACCENTED` for the search that went missing when
 * they were.
 */
export function unaccentedJs(value: string): string {
  return [...value.toLowerCase()].map((character) => FOLD.get(character) ?? character).join("");
}

/** The `ILIKE` pattern for "contains this, accents aside". Empty (or blank) needles are the caller's to refuse. */
export function containsFolded(needle: string): string {
  return `%${unaccentedJs(needle.trim())}%`;
}
