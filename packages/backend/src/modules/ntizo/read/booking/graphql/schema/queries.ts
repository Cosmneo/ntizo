import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { bookingReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * The caller's own bookings, newest first. Takes no customer id — it
 * resolves from the session, so there is nothing to tamper with. BR7 limits
 * reading a booking to its own customer, its provider, or an administrator;
 * this field answers only the first of those.
 */
export const listMyBookings = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(bookingReadModel)),
  docs: { summary: "Your own bookings", tags: ["Booking"] },
});

/**
 * One of the caller's own bookings, by id — what checkout's steps 2 and 3
 * load. `booking.mine` answers with a list, and a page about one booking has
 * no use for one.
 *
 * Takes no customer id here either, for the same reason `mine` does not: it
 * resolves from the session, and the repository filters on it *inside the
 * query* rather than checking it after the read — see
 * `BookingReadRepositoryPort.findForCustomer`.
 *
 * The output is nullable, and covers two cases without distinguishing them:
 * no such booking, and one that is not the caller's. Telling an unrelated
 * caller which it was would confirm that a given id names a real booking.
 */
export const getMyBooking = defineQuery({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(bookingReadModel.nullable()),
  docs: { summary: "One of your own bookings", tags: ["Booking"] },
});

/**
 * Nested one level, like `activity`'s and `notification`'s: the field kit
 * flattens these to `bookingMine` and `bookingById` on the wire —
 * `{ booking: { mine } }` → `bookingMine`, never `booking.mine`. Sits
 * alongside `write/booking`'s `booking: { create, submit }`, which flattens
 * to `bookingCreate` and `bookingSubmit` — the groups merge into one
 * `booking` without colliding because they name different leaves.
 */
export const bookingReadSchema = defineGraphQLSchema(
  {
    booking: {
      mine: listMyBookings,
      byId: getMyBooking,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
