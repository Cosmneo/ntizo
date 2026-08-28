/**
 * When a link on a browse page counts as "the page you are on".
 *
 * TanStack matches a `<Link>`'s search as a **subset** of the current
 * location's by default, and sets `aria-current="page"` on every link that
 * matches. On a filtered listing that is every link which only *removes*
 * something: "All" in the category rail, "Suggested" in the sort, "Clear all",
 * page 1 of the pager, and each chip's own ✕. A screen reader then hears five
 * current pages, and the pager announces both page 1 and page 4 as where the
 * reader is — which is how this was found.
 *
 * `exact` turns that subset test into an equality test on both the path and
 * the search, which is what "this is the page you are on" actually means.
 *
 * A shared constant rather than a literal at each of a dozen call sites: it is
 * the same decision on both listings, and one written `{ exact: true }` is one
 * link that silently starts lying again.
 */
export const EXACT_MATCH = { exact: true } as const;
