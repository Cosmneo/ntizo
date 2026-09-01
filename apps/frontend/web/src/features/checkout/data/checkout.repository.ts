import { queryOptions } from "@tanstack/react-query";
import type { BookingDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

/**
 * Field name is flat — `bookingCreate`, never `booking { create }`. The
 * backend declares it as `{ booking: { create } }` and the field kit
 * flattens that on the wire; `read/booking/graphql/schema/queries.ts` spells
 * the rule out in its own doc comment, alongside `bookingMine`/`bookingById`
 * from the read tier that merge into the same `booking` group without
 * colliding.
 *
 * **The input carries no address and no description, and that absence is the
 * whole design.** This is checkout's step 1: the customer has picked a time
 * and nothing else, and the draft has to exist before the address does or the
 * slot could not be held while they fill the rest in. Both fields belong to
 * `bookingSubmit`, on step 3. They are not merely omitted here — the schema
 * has no such fields to send.
 *
 * There is no `customerId` and no `durationMinutes` either: the first comes
 * from the session (`requireUser`), the second from the service option the
 * command reads. Sending either would be sending something the server will
 * not read.
 *
 * `expiresAt` on the way back is when the hold lapses — the clock the
 * checkout countdown runs on across all three pages.
 */
const CREATE = `
  mutation BookingCreate($input: BookingCreateInput!) {
    bookingCreate(input: $input) { bookingId expiresAt }
  }`;

export interface CreateBookingInput {
  serviceOptionId: string;
  /**
   * One member's id, never "anyone". The customer may well have chosen
   * "anyone available" in the picker, but a held slot belongs to somebody's
   * calendar, so the page resolves that absence to a concrete member off the
   * chosen start's own `memberIds` before it gets here.
   */
  providerMemberId: string;
  /** ISO 8601 instant, exactly as `availability.forService` sent it. */
  startsAt: string;
  /** The locale the customer is reading in — what the booking snapshots its service and option names in. */
  locale: string;
}

export interface CreatedBooking {
  bookingId: string;
  /** ISO 8601. When the hold on the slot lapses if checkout is not finished. */
  expiresAt: string;
}

/**
 * Turns a chosen slot into a `DRAFT` that holds it.
 *
 * `sessionGraphql`, not `publicGraphql`: holding a slot is something a
 * signed-in person does, and the mutation refuses an anonymous caller with
 * `UNAUTHENTICATED`. That refusal is an expected outcome on this page rather
 * than a bug — the choose-when page is public and reachable signed out — and
 * the page turns it into a trip through sign-in and back.
 *
 * Creating a draft also expires whichever draft this customer already held
 * and releases its slot, in the same transaction. That is the server's rule,
 * not this client's, and nothing here needs to clean up after a customer who
 * changed their mind.
 */
export function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  return sessionGraphql<{ bookingCreate: CreatedBooking }>(CREATE, { input }).then(
    (d) => d.bookingCreate,
  );
}

/**
 * A booking as *checkout* reads it — `bookingReadModel` minus the commission.
 *
 * The omission is the type saying what the design says: the commission comes
 * out of the provider's payout, so a customer shown a split would be shown a
 * fee they are not charged. The query below never asks for either field, so
 * neither is on the wire; this type is what turns a page reaching for one
 * into a compile error rather than an `undefined` on screen.
 */
export type CheckoutBooking = Omit<BookingDTO, "commissionBps" | "commissionMinor">;

/**
 * Every field checkout's steps 2 and 3 render, and no others.
 *
 * `commissionBps` and `commissionMinor` are absent deliberately rather than
 * by oversight — see `CheckoutBooking`. The address columns are here because
 * a draft that has already been through step 2 once carries what the customer
 * chose, and `description` for the same reason.
 */
const BOOKING_FIELDS = `
      id status
      serviceName providerName providerSlug optionName durationMinutes
      priceMinor currency
      startsAt endsAt
      addressLabel addressLine addressCity addressDistrict addressDirections
      description expiresAt createdAt`;

/**
 * Flat on the wire — `bookingById`, never `booking { byId }` — for the same
 * reason `bookingCreate` is, spelled out above.
 *
 * There is no `customerId` in the input: the server resolves it from the
 * session and filters on it *inside* the query, so somebody else's id comes
 * back as `null` rather than as a row plus a check.
 */
const BY_ID = `
  query BookingById($input: BookingByIdInput!) {
    bookingById(input: $input) {${BOOKING_FIELDS}
    }
  }`;

export const bookingQueries = {
  /**
   * The caller's own booking, or `null`.
   *
   * `null` means one of three things the server refuses to tell apart — no
   * such booking, not this customer's, or an id that never existed — and
   * checkout treats all three the same way: nothing is being held for you, so
   * back to step 1. A **lapsed** draft is not one of them: the sweep marks it
   * `EXPIRED` and it goes on belonging to its customer, so it arrives here as
   * a row carrying that status rather than as `null`. Both have to be
   * handled, and the pages do.
   *
   * Session-scoped, like the address book's key, and cleared with the rest of
   * the session cache on sign-in and sign-out.
   */
  byId: (bookingId: string) =>
    queryOptions({
      queryKey: ["booking", bookingId] as const,
      queryFn: async (): Promise<CheckoutBooking | null> => {
        const d = await sessionGraphql<{ bookingById: CheckoutBooking | null }>(BY_ID, {
          input: { bookingId },
        });
        return d.bookingById;
      },
    }),
};
