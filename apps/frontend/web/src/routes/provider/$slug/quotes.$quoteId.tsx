import { createFileRoute } from "@tanstack/react-router";
import { ProviderQuotePage } from "@/features/provider/quotes/ui/quote-page";

/**
 * One quote, on its own page — the destination every row of the queue links
 * to, and the only place a workspace reads the job in full and writes a
 * price.
 *
 * `key={quoteId}` forces a remount across quotes: the page's own `editing`
 * state (form vs. the read-only proposal) is a manual override on top of a
 * default derived from the quote in hand, and navigating from one quote's
 * detail page straight to another's must not carry that override along.
 */
export const Route = createFileRoute("/provider/$slug/quotes/$quoteId")({
  component: Quote,
});

function Quote() {
  const { quoteId } = Route.useParams();
  return <ProviderQuotePage key={quoteId} quoteId={quoteId} />;
}
