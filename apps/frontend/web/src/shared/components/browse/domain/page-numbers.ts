export type PageSlot = { page: number; offset: number; current: boolean } | "gap";

/**
 * How many numbers sit either side of the current page once the list is
 * elided. One neighbour each way, plus the current page, plus both ends, plus
 * two gaps, is seven slots — the most that fits beside "Previous"/"Next" on a
 * 360px screen without wrapping.
 */
const WINDOW = 1;

/**
 * How many pages are listed flat before any eliding happens.
 *
 * Seven, because seven is what the windowed form costs at its widest. Eliding
 * below that spends a destination to save nothing.
 */
const MAX_FLAT = 7;

/**
 * The pages a reader can jump to.
 *
 * Empty when there is one page or none — a pager offering "page 1 of 1" is a
 * control with no outcome, and drawing it makes an eight-result search look
 * like a truncated one.
 *
 * A gap is only drawn where it stands in for two or more pages. Replacing a
 * single page with "…" is both longer and worse: the reader loses a
 * destination and gains nothing.
 */
export function pageNumbers(total: number, pageSize: number, offset: number): PageSlot[] {
  const pages = Math.ceil(Math.max(total, 0) / pageSize);
  if (pages <= 1) return [];

  // Clamped, not trusted. `?offset=99999` is a URL somebody can type, and an
  // out-of-range current page would leave nothing marked at all.
  const current = Math.min(Math.max(Math.floor(Math.max(offset, 0) / pageSize) + 1, 1), pages);
  const slot = (page: number): PageSlot => ({
    page,
    offset: (page - 1) * pageSize,
    current: page === current,
  });

  // Short lists are drawn whole. The windowed form below is never narrower
  // than this until there are more than MAX_FLAT pages.
  if (pages <= MAX_FLAT) {
    return Array.from({ length: pages }, (_, i) => slot(i + 1));
  }

  const wanted = new Set<number>([1, pages]);
  for (let p = current - WINDOW; p <= current + WINDOW; p += 1) {
    if (p >= 1 && p <= pages) wanted.add(p);
  }

  const slots: PageSlot[] = [];
  let previous = 0;
  for (const page of [...wanted].sort((a, b) => a - b)) {
    // Exactly one page missing is drawn rather than elided.
    if (page - previous === 2) {
      slots.push(slot(page - 1));
    } else if (page - previous > 2) {
      slots.push("gap");
    }
    slots.push(slot(page));
    previous = page;
  }
  return slots;
}
