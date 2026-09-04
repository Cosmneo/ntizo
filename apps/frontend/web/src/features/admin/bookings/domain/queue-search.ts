import { ADMIN_BOOKING_TABS, type AdminBookingTab } from "@ntizo/shared/read-models";

/**
 * What the queue's address bar is allowed to say.
 *
 * `undefined` for a key that is absent or unusable, which the page reads as
 * "the first tab" and "the first page" — so a URL somebody typed, truncated or
 * inherited from an older link degrades to the queue's own default rather than
 * to an error or an empty screen.
 */
export interface AdminQueueSearch {
  tab?: AdminBookingTab;
  offset?: number;
}

/**
 * The one implementation of that rule, imported by the route that enforces it
 * *and* by the tests that check it.
 *
 * It lived inline in `routes/admin/bookings.tsx` with a copy in the page's
 * test, because `src/routes/**` is the `routes` element and a `ui` file may
 * not import one. The copy passed; deleting the rule from the real route left
 * the whole suite green. A test that exercises a duplicate proves the
 * duplicate works — so there is no duplicate any more: this module is
 * `domain`, which both a route and a test may reach.
 *
 * **`tab` is validated against `ADMIN_BOOKING_TABS`, not against the generated
 * GraphQL type.** The field renders `tab` as a plain `String!` — the kit's
 * behaviour — and enforces the enum at runtime in its own zod input. This is
 * the client's half of that contract, and it is the reason a `?tab=bogus` in
 * the address bar never reaches the wire.
 *
 * **`offset` is a positive safe integer or nothing.** A string, a fraction, a
 * negative, `Infinity`, an empty key: all `undefined`, which is the first
 * page. Zero is deliberately `undefined` too, so the first page of a tab has
 * exactly one address rather than two. It is *not* clamped to a multiple of
 * the page size or to the queue's length — a route cannot know how many
 * bookings need attention, and the page already walks an offset past the end
 * back to the last one that holds a row.
 */
export function parseAdminQueueSearch(search: Record<string, unknown>): AdminQueueSearch {
  const tab = search["tab"];
  const offset = Number(search["offset"]);
  return {
    tab:
      typeof tab === "string" && (ADMIN_BOOKING_TABS as readonly string[]).includes(tab)
        ? (tab as AdminBookingTab)
        : undefined,
    offset: Number.isSafeInteger(offset) && offset > 0 ? offset : undefined,
  };
}
