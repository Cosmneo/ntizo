import { queryOptions } from "@tanstack/react-query";
import type {
  BookingDeclineReason,
  ProviderBookingDetailDTO,
  ProviderBookingPageDTO,
  ProviderBookingStatsDTO,
} from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { PROVIDER_BOOKINGS_PAGE_SIZE, type ProviderQueryTab } from "../domain/status";

const ROW_FIELDS = `
  id status createdAt serviceId serviceOptionId serviceName optionName durationMinutes locationType
  providerMemberId memberFirstName customerFirstName startsAt endsAt timezone
  addressDistrict addressCity priceMinor commissionBps commissionMinor currency respondBy`;

const PAGE = `
  query BookingForProvider($input: BookingForProviderInput!) {
    bookingForProvider(input: $input) {
      items {${ROW_FIELDS}
      }
      total nextOffset
      members { id firstName }
    }
  }`;

const STATS = `
  query BookingStatsForProvider($input: BookingStatsForProviderInput!) {
    bookingStatsForProvider(input: $input) {
      awaitingResponse awaitingPayment upcomingToday upcomingWeek
      completedLast30 declinedLast30 revenueLast30Minor pipelineMinor currency
      perDay { date requests confirmed }
    }
  }`;

const DETAIL = `
  query BookingByIdForProvider($input: BookingByIdForProviderInput!) {
    bookingByIdForProvider(input: $input) {${ROW_FIELDS}
      addressLabel addressLine addressDirections customerPhone customerEmail description paymentRef expiresAt
      timeline { at reason actor pending }
    }
  }`;

const ACCEPT = `
  mutation BookingAccept($input: BookingAcceptInput!) {
    bookingAccept(input: $input) { bookingId }
  }`;

const DECLINE = `
  mutation BookingDecline($input: BookingDeclineInput!) {
    bookingDecline(input: $input) { bookingId }
  }`;

export interface ProviderBookingsPageInput {
  providerId: string;
  tab: ProviderQueryTab;
  q: string;
  memberId: string | null;
  offset: number;
  /** The list's page size unless a caller wants fewer — the dashboard asks for eight. */
  limit?: number;
}

/**
 * Keys start with the workspace, so switching provider cannot serve one
 * workspace's rows under another's heading; every narrowing is in the key.
 */
export const providerBookingQueries = {
  page: (input: ProviderBookingsPageInput) => {
    const q = input.q.trim();
    const limit = input.limit ?? PROVIDER_BOOKINGS_PAGE_SIZE;
    return queryOptions({
      queryKey: [
        "provider",
        input.providerId,
        "bookings",
        input.tab,
        q,
        input.memberId,
        input.offset,
        limit,
      ] as const,
      queryFn: async (): Promise<ProviderBookingPageDTO> => {
        const d = await sessionGraphql<{ bookingForProvider: ProviderBookingPageDTO }>(PAGE, {
          input: {
            providerId: input.providerId,
            tab: input.tab,
            ...(q ? { q } : {}),
            ...(input.memberId ? { memberId: input.memberId } : {}),
            limit,
            offset: input.offset,
          },
        });
        return d.bookingForProvider;
      },
      enabled: input.providerId !== "",
    });
  },
  detail: (providerId: string, bookingId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "booking", bookingId] as const,
      queryFn: async (): Promise<ProviderBookingDetailDTO | null> => {
        const d = await sessionGraphql<{ bookingByIdForProvider: ProviderBookingDetailDTO | null }>(DETAIL, {
          input: { providerId, bookingId },
        });
        return d.bookingByIdForProvider;
      },
      enabled: providerId !== "" && bookingId !== "",
    }),
  /**
   * The workspace's numbers. One key for the whole dashboard *and* the
   * sidebar's badge: they show the same figure, so they must not be able to
   * show two. Thirty seconds of staleness is the badge's old bargain kept.
   */
  stats: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "booking-stats"] as const,
      queryFn: async (): Promise<ProviderBookingStatsDTO> => {
        const d = await sessionGraphql<{ bookingStatsForProvider: ProviderBookingStatsDTO }>(STATS, {
          input: { providerId },
        });
        return d.bookingStatsForProvider;
      },
      enabled: providerId !== "",
      staleTime: 30_000,
    }),
};

export async function acceptBooking(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingAccept: { bookingId: string } }>(ACCEPT, { input: { bookingId } });
}

export async function declineBooking(bookingId: string, reason?: BookingDeclineReason): Promise<void> {
  await sessionGraphql<{ bookingDecline: { bookingId: string } }>(DECLINE, {
    input: { bookingId, ...(reason ? { reason } : {}) },
  });
}
