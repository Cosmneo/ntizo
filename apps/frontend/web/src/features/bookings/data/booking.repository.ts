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

const CANCEL = `
  mutation BookingCancel($input: BookingCancelInput!) {
    bookingCancel(input: $input) { bookingId }
  }`;

const PAY = `
  mutation BookingPay($input: BookingPayInput!) {
    bookingPay(input: $input) { bookingId promptAlreadySent }
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

/**
 * The customer calls it off. Takes only the booking: whose it is is on the
 * booking, and the command checks the caller against it — never the
 * client's claim. Refuses a stranger with `NOT_BOOKING_CUSTOMER` and a
 * status past payment with `BOOKING_INVALID_TRANSITION`; both surface
 * through `GraphqlError.code` for whoever calls this to branch on.
 */
export async function cancelBooking(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingCancel: { bookingId: string } }>(CANCEL, {
    input: { bookingId },
  });
}

/**
 * The customer presses "Pagar" and asks to be charged right now, rather
 * than waiting for the sweep's next tick to reach this booking on its own.
 *
 * Takes only the booking, for the same reason `cancelBooking` does: whose it
 * is is on the row, and `RequestBookingChargeCommand` checks the caller
 * against it, never the client's claim. Resolves once the M-Pesa prompt is
 * scheduled, not once it is answered — the command itself never waits for
 * the gateway call behind it (up to 110 seconds), so a caller that awaits
 * this learns nothing about whether the customer actually paid. `PayDialog`
 * is what learns that, by re-reading the booking.
 *
 * Refusals reach this call through `GraphqlError.code`:
 * `NOT_BOOKING_CUSTOMER` (a stranger's id), `BOOKING_INVALID_TRANSITION`
 * (the booking is no longer `PENDING_PAYMENT`), `BOOKING_NO_CUSTOMER_PHONE`
 * (nothing to send the prompt to), `BOOKING_CHARGE_ATTEMPTS_SPENT` (the
 * three tries are gone), `BOOKING_PAYMENT_WINDOW_CLOSED` (too little of the
 * window left to safely start a gateway call), `BOOKING_CHARGE_UNAVAILABLE`
 * (the processor is not configured — nobody's prompt is going anywhere),
 * plus `UNAUTHENTICATED` and `BOOKING_NOT_FOUND`, which any mutation on this
 * mount can raise.
 *
 * **`promptAlreadySent` is not one of them.** A press inside the charge
 * cooldown pushes nothing over a prompt that may still be live on the
 * handset, but the customer did ask and a charge is in flight — so the
 * command answers with a fact rather than an error, and `PayDialog` words
 * the waiting state differently for it. See `RequestBookingChargeOutcome`.
 */
export async function payBooking(bookingId: string): Promise<PayBookingResult> {
  const d = await sessionGraphql<{ bookingPay: PayBookingResult }>(PAY, {
    input: { bookingId },
  });
  return d.bookingPay;
}

export interface PayBookingResult {
  bookingId: string;
  /** True when the prompt this press asked for had already gone out moments ago. */
  promptAlreadySent: boolean;
}
