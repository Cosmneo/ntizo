import { z } from "zod";

/**
 * The four ways a booking can be reached.
 *
 * A `const` array with the type derived from it, not a bare union: the API
 * validates an incoming value at request time and a type union has nothing to
 * validate against. Same shape as `USER_ROLES` and `LOCALES`.
 */
export const BOOKING_PATHS = [
  "package",      // A — fixed-price package
  "hourly",       // B — hourly booking
  "custom_quote", // C — customer requests a quote
  "task_bid",     // D — customer posts a task, providers bid
] as const;

export const bookingPathSchema = z.enum(BOOKING_PATHS);
export type BookingPath = (typeof BOOKING_PATHS)[number];

/**
 * Where the work happens.
 *
 * "In person" is not one of these — it is the umbrella over `at_provider`,
 * `at_customer` and `flexible`. The interface may present it as a first
 * question; the stored value is always one of these four.
 */
export const SERVICE_LOCATION_TYPES = [
  "at_customer",
  "at_provider",
  "remote",
  "flexible",
] as const;

export const serviceLocationTypeSchema = z.enum(SERVICE_LOCATION_TYPES);
export type ServiceLocationType = (typeof SERVICE_LOCATION_TYPES)[number];
