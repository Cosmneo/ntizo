import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMER_QUOTE_TABS, type CustomerQuoteTab } from "@ntizo/shared";
import { QuotesPage } from "@/features/quotes/ui/quotes-page";

/**
 * `.index.tsx` beside `.$quoteId.tsx`, never a bare `quotes.tsx`: a bare file
 * matches the sibling route's path but never mounts it — see
 * `bookings.index.tsx`'s identical note for why.
 *
 * Every key is returned, and a rejected one as `undefined` rather than
 * omitted — the root has no `validateSearch`, so an omitted key leaves the raw
 * URL value in place.
 */
export const Route = createFileRoute("/_customer/quotes/")({
  validateSearch: (search: Record<string, unknown>): { tab?: CustomerQuoteTab } =>
    CUSTOMER_QUOTE_TABS.includes(search["tab"] as CustomerQuoteTab)
      ? { tab: search["tab"] as CustomerQuoteTab }
      : {},
  component: QuotesPage,
});
