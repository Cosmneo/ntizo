/**
 * Workspace slugs: a readable stem plus a suffix derived from the id.
 *
 * Every slug carries a suffix — including the first business to claim a name.
 * The earlier version handed the bare name to whoever registered first and
 * numbered everyone after (`salao-beleza`, then `salao-beleza-2`), which reads
 * as a ranking nobody earned and makes the URL of the first business depend on
 * a race. One shape for everyone removes both problems, and it is the shape
 * the reference project settled on for the same reason.
 *
 * The suffix is *derived from the provider's id*, not drawn at random and not
 * counted. That is what keeps it to a single existence check in the normal
 * case: the same id always produces the same slug, so generation is a pure
 * function and the database is asked one question rather than probed in a loop
 * that grows with every namesake.
 *
 * Crockford base32 rather than hex or plain digits: no `i`, `l`, `o` or `u`,
 * so a slug read off a screen and typed back cannot become a different one,
 * and it cannot accidentally spell a word.
 */

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/** Longest readable stem. The suffix and separator sit on top of this. */
const MAX_STEM = 48;

/** Suffix length to start at, and the longest worth trying. */
const BASE_SUFFIX = 6;
const MAX_SUFFIX = 12;

/**
 * Kebab-cases a name into URL-safe ASCII.
 *
 * `NFKD` first so "Salão" decomposes and the combining tilde can be dropped,
 * leaving `salao` — not `salo`, which is what stripping non-ASCII without
 * decomposing would give, and not `sal-o`, which is what a naive replace does.
 */
export function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, MAX_STEM);
}

/** The low bits of a UUID, base32-encoded. */
function encodeId(id: string, length: number): string {
  let n = BigInt("0x" + id.replace(/-/g, ""));
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out = CROCKFORD[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

/**
 * Every candidate slug for this provider, shortest first.
 *
 * A generator rather than a list so the caller stops asking the database the
 * moment one is free. Collisions are already vanishingly unlikely at six
 * characters over one name; extending the suffix costs a query only when they
 * happen.
 */
export function* slugCandidates(name: string, id: string): Generator<string> {
  // An empty stem is possible — a name written entirely in a non-Latin script
  // reduces to nothing. The suffix alone is still a valid, unique URL, which
  // beats refusing to create the business.
  const stem = slugifyName(name);
  for (let length = BASE_SUFFIX; length <= MAX_SUFFIX; length += 1) {
    const suffix = encodeId(id, length);
    yield stem ? `${stem}-${suffix}` : suffix;
  }
}
