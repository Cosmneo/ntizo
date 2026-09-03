import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { BOOKING_DECLINE_REASONS } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Turns a checkout into a held slot and a debt the customer has not paid
 * yet — `CreateBookingCommand`'s own doc comment has the full story.
 *
 * **There is no `customerId` and no `durationMinutes` field, and both
 * absences are the point.** The customer comes from `requireUser(ctx)` in
 * the handler, never from this input — an input field here would make this
 * the mutation that books a slot on someone else's behalf. The duration
 * comes from the service option the command reads (`pricing.durationMinutes`),
 * not from the client, which is the whole reason a customer cannot book a
 * two-minute house clean by editing a payload: there is no field to edit.
 *
 * **`providerMemberId` is the third field of that class, and it could not be
 * omitted the same way.** Unlike `customerId` and `durationMinutes`, there is
 * no server-side source for "which member's calendar" — the customer is
 * genuinely choosing one, off the same availability modal that calls
 * `ListServiceAvailability`. So this field stays, and the bug an omission
 * would have prevented is closed by a check instead:
 * `SlotValidityReaderPort`, called from `CreateBookingCommand` before
 * anything is written, refuses a member who does not perform this service —
 * including a member borrowed from a *different* provider's option, which
 * used to reach `Booking.create` with nothing but a foreign key standing in
 * its way and would silently hold that other provider's calendar against a
 * real customer. The same call also refuses a provider that is not `active`
 * and a `startsAt` that is not a real, future, on-grid start for that
 * member.
 *
 * **There is no `address` and no `description` field either, and that is the
 * whole reason this flow works.** This mutation is checkout's step 1: the
 * customer has picked a time and nothing else, and the draft has to be able
 * to exist before the address does or the slot could not be held while they
 * fill the rest in. Both fields moved to `submitBooking` below, where the
 * customer actually supplies them. They are *removed* rather than made
 * optional: an optional field nothing ever sets is a field somebody
 * eventually sets wrongly, and a draft carrying half an address is one
 * `Booking.submit` would then have to reconcile against the address it was
 * handed.
 *
 * The bounds here mirror the aggregate's rather than replacing them — this
 * is the edge refusing obvious nonsense cheaply (a `startsAt` that isn't a
 * real date), with `Booking.create` as the place the rule is *defined*. See
 * `write/review`'s schema comment for the same argument made about a rating
 * of 4.5.
 *
 * `startsAt` crosses the wire as an ISO string (`z.string().datetime()`) —
 * GraphQL has no native `Date` scalar this kit uses — and the handler
 * converts it to a `Date` before calling the command. The conversion lives
 * in the handler, not here and not in the command: `CreateBookingInput`'s own
 * type says `Date` and should keep saying it.
 */
export const createBooking = defineMutation({
  input: zodSchema(
    z.object({
      serviceOptionId: z.string().min(1),
      providerMemberId: z.string().min(1),
      startsAt: z.string().datetime(),
      // The locale the customer was reading the page in — the same locale
      // `ServicePricingReaderPort.findOption` uses to snapshot the service
      // and option names onto the booking.
      locale: z.string().min(2),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), expiresAt: z.string() })),
  docs: { summary: "Book a service option", tags: ["Booking"] },
});

/**
 * The customer finishes checkout and sends the request on to the provider.
 *
 * **There is no `customerId` field**, for the same reason `createBooking`
 * has none: the customer comes from `requireUser(ctx)`, and a field here
 * would make this the mutation that submits somebody else's draft. The
 * command's own authorisation check refuses a requester who is not the
 * booking's customer.
 *
 * The address arrives here rather than on `createBooking` because the
 * customer supplies it on step 2, after the slot is already held — see the
 * design's own account of the conflict this resolves. `description` travels
 * with it because it is the same page's other field: step 2 is the address
 * *and* the optional note about what needs doing.
 *
 * The bounds are the edge's cheap refusal, not the rule: `Booking.submit`
 * is where a blank or missing address component is actually refused, and
 * `SubmitBookingCommand` deliberately keeps no second copy of that check.
 * What this schema does add is the guarantee that `label`, `line` and `city`
 * are present, non-blank strings by the time any of them reaches the
 * aggregate — the kit validates every input against this schema before the
 * handler runs (`validateInput` defaults to `true`), so an `undefined`
 * component cannot arrive from the wire.
 *
 * **`.optional()` sits beside `.nullable()` on every field that is genuinely
 * optional, and the pair is not redundant.** Zod's `.nullable()` accepts
 * `null` and rejects `undefined`; GraphQL lets a document simply omit a
 * nullable input field, and an omitted key arrives as `undefined`. Without
 * `.optional()` the omission is a validation failure rather than the null it
 * plainly means — so a client would have to be told "send explicit nulls",
 * which is exactly the kind of instruction that holds until it doesn't.
 * Three clients are about to be written against this surface.
 */
export const submitBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      address: z.object({
        label: z.string().trim().min(1),
        line: z.string().trim().min(1),
        city: z.string().trim().min(1),
        district: z.string().trim().min(1).nullable().optional(),
        directions: z.string().trim().max(500).nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
      }),
      description: z.string().trim().max(1000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), respondBy: z.string() })),
  docs: { summary: "Send a booking request to the provider", tags: ["Booking"] },
});

/**
 * The provider's yes. Takes only the booking: which workspace it belongs to
 * is on the booking, and whether the caller is in that workspace is the
 * command's check (`ProviderMemberReaderPort.isMember`), not the client's
 * claim. Returns the id and nothing else — the page refetches the booking,
 * which by then carries the payment window on `expiresAt`.
 */
export const acceptBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Accept a booking request", tags: ["Booking"] },
});

/** The provider's no, with one of four reasons or none. Tokens, never prose: the customer's inbox translates them. */
export const declineBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      reason: z.enum(BOOKING_DECLINE_REASONS).optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Decline a booking request", tags: ["Booking"] },
});

export const bookingWriteSchema = defineGraphQLSchema(
  { booking: { create: createBooking, submit: submitBooking, accept: acceptBooking, decline: declineBooking } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
