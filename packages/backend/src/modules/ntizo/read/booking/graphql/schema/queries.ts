import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  ADMIN_BOOKING_TABS,
  adminBookingPageReadModel,
  bookingReadModel,
  providerBookingDetailReadModel,
  providerBookingPageReadModel,
  providerBookingStatsReadModel,
} from "@ntizo/shared/read-models";
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
 * A workspace's bookings, one tab at a time. `providerId` is explicit, as it
 * is on the wallet's read: a person may belong to several workspaces and the
 * shell knows which one is active. Who may ask is decided in the handler —
 * a member of the workspace, or an administrator.
 */
export const listProviderBookings = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      tab: z.enum(["requests", "upcoming", "history", "all"]),
      q: z.string().trim().max(80).optional(),
      memberId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(providerBookingPageReadModel),
  docs: { summary: "A workspace's bookings, by tab", tags: ["Booking"] },
});

/** One of the workspace's bookings. Null covers "no such booking" and "not yours" alike, as `booking.byId` does. */
export const getProviderBooking = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), bookingId: z.string().min(1) })),
  output: zodSchema(providerBookingDetailReadModel.nullable()),
  docs: { summary: "One of a workspace's bookings", tags: ["Booking"] },
});

/**
 * Every number the dashboard draws, for one workspace. No date range on the
 * input: the window is the spec's thirty days and the screen has no control
 * to change it, so a parameter would be a promise the UI does not keep.
 */
export const getProviderStats = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerBookingStatsReadModel),
  docs: { summary: "A workspace's booking numbers", tags: ["Booking"] },
});

/**
 * The bookings an administrator has to look at, one tab at a time.
 *
 * **Takes no workspace, and that absence is the field.** Every other
 * provider-side read here names a `providerId` so that the handler can decide
 * whether the caller may have that workspace's rows; this one spans all of
 * them by design, so there is nothing to decide about and nothing to send.
 * Who may ask is decided entirely in the handler, by the platform role the
 * session resolved to — never by anything on this input. See the handler's
 * own `requireAdmin`, which is this field's whole security surface.
 *
 * `limit` is capped here as well as clamped in the projection: the edge is
 * the cheaper of the two places to refuse a page of ten thousand, and the
 * projection's clamp is what protects a caller that is not this field.
 */
export const listAdminBookings = defineQuery({
  input: zodSchema(
    z.object({
      tab: z.enum(ADMIN_BOOKING_TABS),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(adminBookingPageReadModel),
  docs: { summary: "The bookings an administrator has to look at", tags: ["Booking"] },
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
      forProvider: listProviderBookings,
      byIdForProvider: getProviderBooking,
      statsForProvider: getProviderStats,
      needsAttentionForAdmin: listAdminBookings,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
