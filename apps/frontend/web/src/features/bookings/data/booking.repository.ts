import { queryOptions } from "@tanstack/react-query";
import type {
  CustomerBookingDetailDTO,
  CustomerBookingPageDTO,
} from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import {
  CUSTOMER_BOOKINGS_PAGE_SIZE,
  type CustomerBookingTab,
} from "../domain/status";

/** No commission fields: they left `bookingReadModel` on 2026-09-03 and cannot be asked for. */
const ROW_FIELDS = `
  id status serviceId serviceOptionId serviceName providerName providerSlug providerVerified
  providerRatingAverage optionName durationMinutes locationType priceMinor currency
  startsAt endsAt timezone addressLabel addressLine addressCity addressDistrict addressDirections
  description expiresAt paidAt createdAt`;

const PAGE = `
  query BookingMine($input: BookingMineInput!) {
    bookingMine(input: $input) {
      items {${ROW_FIELDS}
      }
      total nextOffset
      counts { waiting upcoming history }
    }
  }`;

const DETAIL = `
  query BookingById($input: BookingByIdInput!) {
    bookingById(input: $input) {${ROW_FIELDS}
      timeline { at reason actor pending }
    }
  }`;

export interface MyBookingsPageInput {
  tab: CustomerBookingTab;
  offset: number;
}

export const myBookingQueries = {
  page: (input: MyBookingsPageInput) =>
    queryOptions({
      queryKey: ["bookings", "mine", input.tab, input.offset] as const,
      queryFn: async (): Promise<CustomerBookingPageDTO> => {
        const d = await sessionGraphql<{ bookingMine: CustomerBookingPageDTO }>(
          PAGE,
          {
            input: {
              tab: input.tab,
              limit: CUSTOMER_BOOKINGS_PAGE_SIZE,
              offset: input.offset,
            },
          },
        );
        return d.bookingMine;
      },
    }),
  detail: (bookingId: string) =>
    queryOptions({
      queryKey: ["bookings", "mine", "one", bookingId] as const,
      queryFn: async (): Promise<CustomerBookingDetailDTO | null> => {
        const d = await sessionGraphql<{
          bookingById: CustomerBookingDetailDTO | null;
        }>(DETAIL, {
          input: { bookingId },
        });
        return d.bookingById;
      },
    }),
};
