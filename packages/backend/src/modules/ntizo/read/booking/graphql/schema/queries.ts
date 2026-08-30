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
 * Nested one level, like `activity`'s and `notification`'s: the field kit
 * flattens this to `bookingMine` on the wire — `{ booking: { mine } }` →
 * `bookingMine`, never `booking.mine`. Sits alongside `write/booking`'s
 * `booking: { create }`, which flattens to `bookingCreate` — the two merge
 * into one `booking` group without colliding because they name different
 * leaves.
 */
export const bookingReadSchema = defineGraphQLSchema(
  {
    booking: {
      mine: listMyBookings,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
