import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
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
 * The bounds here mirror the aggregate's rather than replacing them — this
 * is the edge refusing obvious nonsense cheaply (a blank address line, a
 * `startsAt` that isn't a real date), with `Booking.create` as the place the
 * rule is *defined*. A blank address line is refused twice, in both places,
 * on purpose; see `write/review`'s schema comment for the same argument made
 * about a rating of 4.5.
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
      address: z.object({
        label: z.string().trim().min(1),
        line: z.string().trim().min(1),
        city: z.string().trim().min(1),
        district: z.string().trim().min(1).nullable(),
        directions: z.string().trim().max(500).nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      }),
      description: z.string().trim().max(1000).nullable(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), expiresAt: z.string() })),
  docs: { summary: "Book a service option", tags: ["Booking"] },
});

export const bookingWriteSchema = defineGraphQLSchema(
  { booking: { create: createBooking } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
