import { createFileRoute } from "@tanstack/react-router";
import { QuotePage } from "@/features/quotes/ui/quote-page";

/**
 * `key={quoteId}` resets the dialog and attachment state below when the
 * router moves between two quotes without unmounting — the same reason
 * `quote.$serviceId.tsx` keys `RequestQuotePage` by `serviceId`.
 *
 * **`quotes.$quoteId.index.tsx`, not `quotes.$quoteId.tsx`.** This segment
 * also owns an `accept` child (`quotes.$quoteId.accept.tsx`) — TanStack
 * Router's flat file convention makes a bare `quotes.$quoteId.tsx` the
 * *layout* for every `quotes.$quoteId.*` sibling the moment one exists, and
 * a layout only shows a child through its own `<Outlet />`, which this page
 * has no reason to render (the acceptance page replaces the detail page, it
 * does not nest inside it). Left as `quotes.$quoteId.tsx`, "Accept and
 * pay …" changed the URL to `/accept` and the child route's own loader-free
 * component matched clean, but nothing mounted it, so the detail page stayed
 * on screen under the new address with no console error to notice by — and,
 * unlike the identical bug `bookings.index.tsx`'s own doc comment records, a
 * fresh `page.goto` straight at the `/accept` URL didn't recover either,
 * confirmed empirically: this route has no working entrance at all until
 * this rename. `bookings.index.tsx` already states this exact fix for the
 * identical shape (`.index.tsx` beside a nested `.{$param}.*.tsx` sibling);
 * this file now matches it. Found and fixed by Task 14 of the quotes-web
 * plan — see that task's own report.
 */
export const Route = createFileRoute("/_customer/quotes/$quoteId/")({
  component: Quote,
});

function Quote() {
  const { quoteId } = Route.useParams();
  return <QuotePage key={quoteId} quoteId={quoteId} />;
}
