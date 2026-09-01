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
 * `serviceId` and `serviceOptionId` are identity, not snapshot, and are
 * carried for a reader that has to *link* somewhere rather than print
 * something — see their own comment. They are not an invitation to join:
 * a consumer that reads `serviceName` off the service instead of off the
 * booking has reintroduced exactly the drift this model exists to prevent.
 *
 * `commissionBps` travels with `commissionMinor` on purpose. The amount alone
 * cannot be checked, and the rate alone cannot be reconciled against money
 * that already moved — an administrator changing a provider's rate tomorrow
 * must leave both of these untouched.
 */
export const bookingReadModel = z.object({
  id: z.string().min(1),

  /**
   * **A set, not a sequence.** The members mirror the backend's
   * `BookingStatus`, whose order stopped describing the flow when payment and
   * confirmation swapped places — `PENDING_PAYMENT` is listed above
   * `AWAITING_PROVIDER` and reached after it. Zod validates membership and
   * ignores order, so nothing here depends on the arrangement; a consumer that
   * wants the flow wants the state machine, not this list. See
   * `BookingStatus`'s own header for why the claim was deleted rather than the
   * order rewritten.
   */
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

  /**
   * **The ids are not part of the snapshot, and the distinction is the whole
   * reason they can be here.** What the snapshot protects is the *names* and
   * the *money* — a provider renaming a service must not rewrite what a
   * customer booked. An id names the same row forever; it cannot drift,
   * because there is nothing about it to drift.
   *
   * They are here because checkout needs them. Steps 2 and 3 run a countdown
   * whose only action is to send the customer back to step 1 — `/book/<the
   * service>`, on the package they chose — when the hold lapses, and before
   * this they had no way to know either. Carrying them in the URL instead
   * made two sources for one fact: a shared or bookmarked link could name a
   * service that disagreed with the booking, and nothing would notice.
   *
   * `NOT NULL` on the table, so never null here. A booking without a service
   * option is not a booking.
   */
  serviceId: z.string().min(1),
  serviceOptionId: z.string().min(1),

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

  /**
   * The IANA zone `startsAt` and `endsAt` mean anything in — the provider's
   * own, which is the authority on when a slot is, everywhere else in the
   * platform (`availability.forService` answers with the same field off the
   * same column, and `SlotValidityReaderPort` decides what is on the grid
   * with it).
   *
   * **Without it a reader can only fall back to the device's zone, and that
   * is a defect with a history.** A service in `Africa/Maputo` viewed from a
   * device clocked to UTC drew checkout's step-1 grid on the wrong civil
   * date, under a confirm button that stayed live — fixed by taking the zone
   * from the response rather than from the browser. Steps 2 and 3 read the
   * booking instead of the calendar, so the same fact has to be on the
   * booking or the same defect comes back one page later, printing a
   * customer a different appointment to the one they will get.
   *
   * **Not part of the snapshot**, and read live off `provider.timezone`
   * rather than copied onto the row. It is the same class of field as
   * `serviceId`: what it identifies cannot drift the way a name or a price
   * can, because a provider that moves zone has moved the appointment too —
   * the instant in `startsAt` is unchanged and the civil time it is spoken
   * of in follows the provider, which is the honest answer rather than a
   * stale one.
   */
  timezone: z.string().min(1),

  // Null on a DRAFT and only on a DRAFT: the customer holds the slot from
  // step 1 and gives the address on step 2, so a draft that has not reached
  // step 2 has no address to report. `submit` refuses without one, so any
  // status past DRAFT carries all three.
  addressLabel: z.string().nullable(),
  addressLine: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressDistrict: z.string().nullable(),
  addressDirections: z.string().nullable(),

  /** What the customer wrote about the job. */
  description: z.string().nullable(),

  /**
   * The deadline currently running against this booking — **whichever of the
   * design's three clocks its status is standing on**, not the payment window
   * in particular. Each hop stamps this column with its own clock's deadline:
   * `DRAFT` carries the checkout hold, `AWAITING_PROVIDER` the provider's
   * response window, `PENDING_PAYMENT` the payment window. Those three are
   * the only statuses on which this field means anything, and every one of
   * them caps its deadline at `startsAt` — a slot is never held past its own
   * start.
   *
   * **It is never cleared, so read the status first.** No transition nulls
   * this: a `CONFIRMED` or `MARKED_DONE` booking still carries the deadline
   * it was last given, now in the past, deliberately — see
   * `BookingProps.expiresAt` in the backend for the argument, which is that
   * a customer disputing "you gave my slot away" needs the deadline they
   * were actually given, and the three window lengths are live settings that
   * cannot reconstruct it afterwards. A countdown driven off this field
   * ("Hora reservada 29:40") must therefore check `status` against those
   * three before rendering anything; a consumer that trusts the date alone
   * will show an expired timer on a booking that is paid and confirmed.
   *
   * Null only ever means the column was never stamped, which nothing writes
   * today. It stays nullable because the column is.
   */
  expiresAt: z.string().nullable(),

  createdAt: z.string(),
});

export type BookingDTO = z.infer<typeof bookingReadModel>;
