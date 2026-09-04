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
 *
 * Exported for `__tests__/checkout.repository.test.ts` — see `BOOKING_FIELDS`
 * for why a document nothing can read is a document nothing can check.
 */
export const CREATE = `
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
 * A booking as checkout reads it.
 *
 * This used to be `BookingDTO` minus the commission, with a test that read
 * the query document to prove neither field was asked for. Both fields left
 * `bookingReadModel` itself on 2026-09-03 — see that model's own comment —
 * so the alias is now the model, and the fence is the type rather than this
 * file's discipline.
 */
export type CheckoutBooking = BookingDTO;

/**
 * Every field checkout's steps 2 and 3 render, and no others.
 *
 * `commissionBps` and `commissionMinor` are absent deliberately rather than
 * by oversight — see `CheckoutBooking`. The address columns are here because
 * a draft that has already been through step 2 once carries what the customer
 * chose, and `description` for the same reason.
 *
 * `serviceId` and `serviceOptionId` are what let steps 2 and 3 send a
 * customer whose hold lapsed back to step 1 on the package they chose. They
 * are read here rather than carried in the URL because two sources for one
 * fact is one too many: a shared or bookmarked link could name a service that
 * disagreed with the booking, and nothing would notice.
 *
 * `providerVerified` and `providerRatingAverage` are the rail's trust line —
 * `Hélder Cossa · 4,8 ★ · Verificado`. **Asking for them is not a crack in
 * the commission's absence**, and the distinction is worth stating because
 * both are decisions about what checkout may see: these two are already
 * public, rendered on every browse card and on the provider's own page, and
 * they are what a customer about to hold a slot is deciding on. The
 * commission is neither public nor theirs — it comes out of the provider's
 * payout — so it stays off this document, and cannot do otherwise: it left
 * `bookingReadModel` itself, so there is no field left here to ask for.
 *
 * `locationType` is the rail's second line — "Em sua casa · 240 min" — and
 * the fact it decides "Deslocação — Incluída" from. Steps 2 and 3 had neither
 * until it was on the booking, so the rail they share with step 1 quietly
 * lost a line halfway through one purchase. It is read live off the service
 * today, which is a gap rather than a decision — see follow-up #119.
 *
 * `timezone` is asked for because `startsAt` and `endsAt` are instants and
 * step 3 prints them. Without it the only clock a browser has is its own, and
 * a service in `Africa/Maputo` read on a device clocked to UTC would tell the
 * customer a different appointment to the one the provider is expecting them
 * for — the same substitution that drew step 1 an empty grid before
 * `chosenCivilDate` took the zone off the availability response.
 *
 * **Exported because until it was, the omission could not fail.** The
 * commission's absence is described everywhere as a two-level protection:
 * `CheckoutBooking` omits both fields, so a page reading one is a compile
 * error, and this selection never asks for them, so neither is on the wire.
 * The first level is real. The second was a template string no test in this
 * repo ever evaluated — every checkout suite `vi.mock`s this module whole —
 * and adding `commissionBps commissionMinor` to this very line left the
 * entire web suite green: 139 files, 1526 tests. A type cannot read a string,
 * so the string has to be readable by something that can.
 */
export const BOOKING_FIELDS = `
      id status
      serviceId serviceOptionId
      serviceName providerName providerSlug providerVerified providerRatingAverage
      optionName durationMinutes locationType
      priceMinor currency
      startsAt endsAt timezone
      addressLabel addressLine addressCity addressDistrict addressDirections
      description expiresAt createdAt`;

/**
 * Flat on the wire — `bookingById`, never `booking { byId }` — for the same
 * reason `bookingCreate` is, spelled out above.
 *
 * There is no `customerId` in the input: the server resolves it from the
 * session and filters on it *inside* the query, so somebody else's id comes
 * back as `null` rather than as a row plus a check.
 *
 * Exported for the same reason `BOOKING_FIELDS` is: this is the document that
 * actually goes on the wire for the page the design singles out as money.
 */
export const BY_ID = `
  query BookingById($input: BookingByIdInput!) {
    bookingById(input: $input) {${BOOKING_FIELDS}
    }
  }`;

/**
 * Flat on the wire — `bookingSubmit`, never `booking { submit }` — for the
 * reason spelled out above `bookingCreate`.
 *
 * **There is no phone number in this input, and that is the design rather
 * than an omission.** Setting a phone number is the User context's job; a
 * booking command reaching across to write a profile would need a writer port
 * that exists for no other reason. Step 3 therefore calls
 * `user.updateMyProfile` first and this second — two mutations, in that
 * order. `submit` then *refuses* a customer with no number on file, reading
 * through the same `CustomerPhoneReaderPort` the charge sweep uses, which is
 * what makes the requirement a rule instead of a form convention: a UI can be
 * skipped by anything that calls this mutation directly.
 *
 * `respondBy` on the way back is the provider's deadline, computed server-side
 * from the live `provider_response_minutes` setting and capped at the slot's
 * own start. It is not sent, and it is not guessed at on this side: a window
 * an administrator can change is not a number a client may hardcode.
 *
 * Exported for the same reason `BOOKING_FIELDS` is.
 */
export const SUBMIT = `
  mutation BookingSubmit($input: BookingSubmitInput!) {
    bookingSubmit(input: $input) { bookingId respondBy }
  }`;

/**
 * Where the work happens, in the shape `booking.submit` takes.
 *
 * Deliberately *not* an `AddressDTO` and deliberately not an address id. The
 * booking stores a snapshot — a customer correcting their street next March
 * must not move where a provider went last week — so the components travel by
 * value, and the aggregate keeps its own copy. `label`, `line` and `city` are
 * required because `Booking.submit` refuses a booking past `DRAFT` without
 * all three.
 */
export interface SubmitBookingAddress {
  label: string;
  line: string;
  city: string;
  district?: string | null;
  directions?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface SubmitBookingInput {
  bookingId: string;
  address: SubmitBookingAddress;
  /** What the customer wrote about the job, or `null` when they wrote nothing. */
  description?: string | null;
}

export interface SubmittedBooking {
  bookingId: string;
  /** ISO 8601. When the provider's window to answer runs out. */
  respondBy: string;
}

/**
 * Turns the customer's `DRAFT` into a request a provider has to answer.
 *
 * The second and last write of this checkout. Nothing between `booking.create`
 * and this one touches the server, which is why the address and the note
 * arrive here as arguments rather than as a row somebody already saved.
 */
export function submitBooking(input: SubmitBookingInput): Promise<SubmittedBooking> {
  return sessionGraphql<{ bookingSubmit: SubmittedBooking }>(SUBMIT, { input }).then(
    (d) => d.bookingSubmit,
  );
}

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
