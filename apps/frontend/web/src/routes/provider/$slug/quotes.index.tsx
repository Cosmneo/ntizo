import { createFileRoute } from "@tanstack/react-router";
import { PROVIDER_QUOTE_TABS, type ProviderQuoteTab } from "@ntizo/shared";
import { ProviderQuotesPage } from "@/features/provider/quotes/ui/quotes-page";

/**
 * The tab lives in the URL, exactly as `bookings.index.tsx`'s does: a
 * provider who refreshes on "Histórico" stays there, and a link to "the
 * queue" is a link. Every key is returned, and a rejected one as
 * `undefined` — see `bookings.index.tsx` for why naming the key is what
 * overrides a raw value.
 */
export const Route = createFileRoute("/provider/$slug/quotes/")({
  validateSearch: (search: Record<string, unknown>): { tab?: ProviderQuoteTab } =>
    (PROVIDER_QUOTE_TABS as readonly string[]).includes(search["tab"] as string)
      ? { tab: search["tab"] as ProviderQuoteTab }
      : {},
  component: ProviderQuotesPage,
});
