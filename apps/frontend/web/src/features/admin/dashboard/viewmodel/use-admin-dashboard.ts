import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useContactOpenCount } from "@/features/admin/contact/viewmodel/use-admin-contact";
import { useAdminProviders, useProviderStatusCounts } from "@/features/admin/providers/viewmodel/use-admin-providers";
import { useSupportOpenCount } from "@/features/admin/support/viewmodel/use-admin-support";
import { adminDashboardQueries } from "../data/admin-dashboard.repository";
import { LATEST_APPLICATIONS_LIMIT, needsYou, type NeedsYouItem } from "../domain/needs-you";

/** Every number the tiles and the chart draw. */
export function useAdminStats() {
  return useQuery(adminDashboardQueries.stats());
}

/** The newest applications, whatever their status: who is new, not who is pending. */
export function useLatestApplications() {
  return useAdminProviders({ limit: LATEST_APPLICATIONS_LIMIT });
}

/**
 * The four sources the "Needs you" row reads, folded by `needsYou`. Four
 * bounded contexts, four queries — each one is the same cache entry its own
 * screen uses, so the card and the queue it opens cannot disagree.
 */
export function useNeedsYou(): {
  items: NeedsYouItem[];
  failed: boolean;
  retry: () => void;
} {
  const stats = useAdminStats();
  const providers = useProviderStatusCounts();
  const support = useSupportOpenCount();
  const contact = useContactOpenCount();
  const disputed = stats.data?.disputed;
  const pending = providers.data?.pending;
  const items = useMemo(
    () => needsYou({ disputed, providers: pending, support: support.data, contact: contact.data }),
    [disputed, pending, support.data, contact.data],
  );
  return {
    items,
    // A count that could not be read is not a zero: the row must never say
    // "all clear" over a failed read, so the page shows its error line for any
    // of the four, and one retry asks all four again.
    failed: stats.isError || providers.isError || support.isError || contact.isError,
    retry: () => {
      void stats.refetch();
      void providers.refetch();
      void support.refetch();
      void contact.refetch();
    },
  };
}
