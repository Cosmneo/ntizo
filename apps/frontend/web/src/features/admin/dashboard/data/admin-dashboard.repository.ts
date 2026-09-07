import { queryOptions } from "@tanstack/react-query";
import type { AdminBookingStatsDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const STATS = `
  query BookingStatsForAdmin {
    bookingStatsForAdmin(input: {}) {
      disputed confirmedLast30 completedLast30 grossLast30Minor commissionLast30Minor
      newProvidersLast30 currency
      perDay { date requests confirmed }
    }
  }`;

export const adminDashboardQueries = {
  /**
   * The platform's numbers. Under the admin bookings prefix on purpose: a
   * dispute decided on the queue invalidates `["admin", "bookings"]`, and the
   * dashboard's dispute count has to follow it down.
   */
  stats: () =>
    queryOptions({
      queryKey: ["admin", "bookings", "stats"] as const,
      queryFn: async (): Promise<AdminBookingStatsDTO> => {
        const d = await sessionGraphql<{ bookingStatsForAdmin: AdminBookingStatsDTO }>(STATS, {});
        return d.bookingStatsForAdmin;
      },
      staleTime: 30_000,
    }),
};
