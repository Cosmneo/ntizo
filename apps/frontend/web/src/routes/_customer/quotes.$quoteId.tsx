import { createFileRoute } from "@tanstack/react-router";
import { QuotePage } from "@/features/quotes/ui/quote-page";

/**
 * `key={quoteId}` resets the dialog and attachment state below when the
 * router moves between two quotes without unmounting — the same reason
 * `quote.$serviceId.tsx` keys `RequestQuotePage` by `serviceId`.
 */
export const Route = createFileRoute("/_customer/quotes/$quoteId")({
  component: Quote,
});

function Quote() {
  const { quoteId } = Route.useParams();
  return <QuotePage key={quoteId} quoteId={quoteId} />;
}
