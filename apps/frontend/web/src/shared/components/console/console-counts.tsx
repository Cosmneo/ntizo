import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ProviderStatus } from "@ntizo/shared";
import { useAdminProviders } from "@/features/admin/providers/viewmodel/use-admin-providers";
import { useProviderThreads } from "@/features/messaging/viewmodel/use-provider-threads";
import type { ConsoleCountSource, ConsoleZone } from "@/shared/lib/console-nav";

/**
 * The numbers behind the badges, keyed by the source a nav item names.
 *
 * A nav item declares that it carries a count; it never fetches one. This
 * resolves each declared source against a read the zone already has in
 * scope, so the sidebar, the tab bar and the sheet all show the same number
 * from the same cache entry the page itself uses.
 *
 * Sources with no read behind them yet are simply absent: `bookingRequests`
 * until the bookings plan lands its stats read, `flaggedReviews` until the
 * reviews read exposes a pending count. An absent source draws no badge.
 *
 * Branched at the component level, not with conditional hooks: each zone
 * mounts only its own reads, and the workspace mounts nothing until it knows
 * which workspace it is.
 */
export type ConsoleCounts = Partial<Record<ConsoleCountSource, number>>;

const EMPTY: ConsoleCounts = {};
const Ctx = createContext<ConsoleCounts>(EMPTY);

export function useConsoleCounts(): ConsoleCounts {
  return useContext(Ctx);
}

export function ConsoleCountsProvider({
  zone,
  providerId,
  children,
}: {
  zone: ConsoleZone;
  providerId?: string;
  children: ReactNode;
}) {
  if (zone === "platform") return <PlatformCounts>{children}</PlatformCounts>;
  if (!providerId) return <Ctx.Provider value={EMPTY}>{children}</Ctx.Provider>;
  return <WorkspaceCounts providerId={providerId}>{children}</WorkspaceCounts>;
}

function WorkspaceCounts({ providerId, children }: { providerId: string; children: ReactNode }) {
  const { threads } = useProviderThreads(providerId);
  // Threads with something unread, among the pages loaded so far. The inbox
  // read is paginated and exposes no total, so this is an honest floor
  // rather than a count of everything — the same number the Messages page's
  // first screen shows, from the same cache entry.
  const unreadThreads = threads.filter((thread) => thread.unreadCount > 0).length;
  const value = useMemo<ConsoleCounts>(() => ({ unreadThreads }), [unreadThreads]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function PlatformCounts({ children }: { children: ReactNode }) {
  const pending = useAdminProviders({ status: ProviderStatus.Pending });
  const pendingProviders = pending.data?.length;
  const value = useMemo<ConsoleCounts>(
    () => (pendingProviders === undefined ? EMPTY : { pendingProviders }),
    [pendingProviders],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
