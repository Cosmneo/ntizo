import { z } from "zod";

/**
 * When a service can be had — the answer to the only question a customer
 * actually asks of a calendar.
 *
 * On the **public** tier because the service page reads it signed out. A
 * visitor comparing two barbers has no account yet, and a field that needs a
 * session to say "Wednesday at nine" is a field that cannot sell anything.
 *
 * Every date in the requested window comes back, including the ones with no
 * starts at all: a closed Sunday is information the screen has to draw, and a
 * client that has to infer it from a missing key will infer it wrongly.
 *
 * `pricingMode` is on the response rather than assumed by the caller, because
 * it decides what a start *means*: for a fixed service the length is already
 * known, and for an hourly one the customer still has to choose it.
 */
export const serviceAvailabilityReadModel = z.object({
  serviceId: z.string(),
  timezone: z.string(),
  pricingMode: z.enum(["fixed", "hourly"]),
  days: z.array(
    z.object({
      date: z.string(),
      starts: z.array(
        z.object({
          minuteOfDay: z.number(),
          /** ISO instant, so the browser never re-does the timezone maths. */
          startsAt: z.string(),
          /** Only for hourly services; null for fixed. */
          maxMinutes: z.number().nullable(),
          /** Who is free at this moment. Never empty — a start with nobody is not returned. */
          memberIds: z.array(z.string()),
        }),
      ),
    }),
  ),
});

export type ServiceAvailabilityDTO = z.infer<typeof serviceAvailabilityReadModel>;
export type AvailabilityDayDTO = ServiceAvailabilityDTO["days"][number];
export type AvailabilityStartDTO = AvailabilityDayDTO["starts"][number];
