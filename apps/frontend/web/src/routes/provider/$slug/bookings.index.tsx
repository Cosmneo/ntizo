import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/features/provider/bookings/ui/bookings-page";
import {
  PROVIDER_TABS,
  type ProviderTab,
} from "@/features/provider/bookings/domain/status";

/**
 * The tab lives in the URL: a provider who refreshes on "Histórico" stays
 * there, and a link to "the requests" is a link. Every key is returned, and
 * a rejected one as `undefined` — see `book.$serviceId.tsx` for why naming
 * the key is what overrides a raw value.
 */
export const Route = createFileRoute("/provider/$slug/bookings/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: ProviderTab; member?: string } => {
    const tab = search["tab"];
    const member = search["member"];
    return {
      tab:
        typeof tab === "string" && (PROVIDER_TABS as readonly string[]).includes(tab)
          ? (tab as ProviderTab)
          : undefined,
      member: typeof member === "string" && member !== "" ? member : undefined,
    };
  },
  component: BookingsPage,
});
