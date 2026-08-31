import { z } from "zod";

/**
 * One booking, as its customer or its provider reads it.
 *
 * Everything below the identity fields is the **snapshot** — what was true
 * when the customer bought — rather than a join. `serviceName` is not read
 * from the service today, and `addressLine` is not read from the customer's
 * saved address today, because both are mutable and a booking is a record of
 * what was agreed. A provider renaming a service must not rewrite what a
 * customer booked; a customer correcting their street must not move where a
 * provider went last March.
 *
 * `commissionBps` travels with `commissionMinor` on purpose. The amount alone
 * cannot be checked, and the rate alone cannot be reconciled against money
 * that already moved — an administrator changing a provider's rate tomorrow
 * must leave both of these untouched.
 */
export const bookingReadModel = z.object({
  id: z.string().min(1),

  status: z.enum([
    "DRAFT",
    "PENDING_PAYMENT",
    "AWAITING_PROVIDER",
    "CONFIRMED",
    "MARKED_DONE",
    "COMPLETED",
    "DISPUTED",
    "DECLINED",
    "CANCELLED",
    "EXPIRED",
  ]),

  serviceName: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  optionName: z.string(),
  durationMinutes: z.number().int().positive(),

  priceMinor: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10_000),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),

  startsAt: z.string(),
  endsAt: z.string(),

  addressLabel: z.string(),
  addressLine: z.string(),
  addressCity: z.string(),
  addressDistrict: z.string().nullable(),
  addressDirections: z.string().nullable(),

  /** What the customer wrote about the job. */
  description: z.string().nullable(),

  /**
   * When the payment window closes. Null once the booking is no longer
   * waiting to be paid — a deadline that has stopped applying is absent,
   * not a date in the past somebody has to compare against `now`.
   */
  expiresAt: z.string().nullable(),

  createdAt: z.string(),
});

export type BookingDTO = z.infer<typeof bookingReadModel>;
