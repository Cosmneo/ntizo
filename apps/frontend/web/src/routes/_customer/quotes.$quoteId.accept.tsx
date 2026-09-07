import { createFileRoute } from "@tanstack/react-router";
import { AcceptQuotePage } from "@/features/quotes/ui/accept-page";

/**
 * `key={quoteId}` resets the page's own phone/address/refusal state when the
 * router moves between two quotes without unmounting — the same reason
 * `quotes.$quoteId.tsx` keys `QuotePage` by `quoteId`.
 */
export const Route = createFileRoute("/_customer/quotes/$quoteId/accept")({
  component: Accept,
});

function Accept() {
  const { quoteId } = Route.useParams();
  return <AcceptQuotePage key={quoteId} quoteId={quoteId} />;
}
