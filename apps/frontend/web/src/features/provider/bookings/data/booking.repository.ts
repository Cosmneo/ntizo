import { queryOptions } from "@tanstack/react-query";
import type {
  BookingDeclineReason,
  ProviderBookingDetailDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { PROVIDER_BOOKINGS_PAGE_SIZE, type ProviderTab } from "../domain/status";

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
  tab: ProviderTab;
  q: string;
  memberId: string | null;
  offset: number;
}

/**
 * Keys start with the workspace, so switching provider cannot serve one
 * workspace's rows under another's heading; every narrowing is in the key.
 */
export const providerBookingQueries = {
  page: (input: ProviderBookingsPageInput) => {
    const q = input.q.trim();
    return queryOptions({
      queryKey: ["provider", input.providerId, "bookings", input.tab, q, input.memberId, input.offset] as const,
      queryFn: async (): Promise<ProviderBookingPageDTO> => {
        const d = await sessionGraphql<{ bookingForProvider: ProviderBookingPageDTO }>(PAGE, {
          input: {
            providerId: input.providerId,
            tab: input.tab,
            ...(q ? { q } : {}),
            ...(input.memberId ? { memberId: input.memberId } : {}),
            limit: PROVIDER_BOOKINGS_PAGE_SIZE,
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
};

export async function acceptBooking(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingAccept: { bookingId: string } }>(ACCEPT, { input: { bookingId } });
}

export async function declineBooking(bookingId: string, reason?: BookingDeclineReason): Promise<void> {
  await sessionGraphql<{ bookingDecline: { bookingId: string } }>(DECLINE, {
    input: { bookingId, ...(reason ? { reason } : {}) },
  });
}
