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
 * **No commission.** The rate and the amount are the provider's payout being
 * reduced, never a fee added to this customer's price, so a customer shown a
 * split would be shown a charge they do not pay. They used to be here and be
 * omitted by every caller by hand; follow-up #114 asked for the fence to be
 * the type instead. The provider's own `providerBookingReadModel` is a
 * separate mirror and keeps both, because there the split is the point.
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

  /**
   * The business this booking is with — identity, on the same terms as the
   * two ids above: `booking.provider_id` is a `NOT NULL` FK, an id names the
   * same row forever, and there is nothing about it to drift.
   *
   * It is here because `providerSlug` cannot do this job. A slug addresses a
   * *page*; starting a conversation addresses a *row* —
   * `CommunicationStartThreadInput` takes `providerId`, and the customer's
   * booking pages are exactly where wanting to message the provider happens.
   * Before this, a "Mensagem" button on a booking had to either resolve the
   * slug to an id first (a second round trip for a fact this read already
   * held) or not exist, and it did not exist.
   */
  providerId: z.string().min(1),

  serviceName: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  /**
   * The business's verified badge and review score — **read live, not
   * snapshotted, and deliberately so.**
   *
   * Every other provider field here is a snapshot, because what the customer
   * agreed to must not change under them. These two are the opposite case:
   * they are not terms of the booking, they are what the platform currently
   * asserts about the business, and a customer looking at a request they have
   * not sent yet wants today's answer. A verified badge frozen at the moment
   * of a draft would go on claiming a document the platform has since
   * withdrawn.
   *
   * Joined the same way `timezone` above is, off `provider`, and the same
   * two aggregates the catalogue's own reader builds — see
   * `DrizzleBookingReadRepository` for the copy and why it is one.
   *
   * They are here because checkout's rail is shared across its steps and
   * prints one line — `Hélder Cossa · 4,8 ★ · Verificado`. Step 1 reads it
   * off `serviceDetailReadModel`, which publishes the same two fields; steps
   * 2 and 3 have only the booking, and a rail that quietly lost its trust
   * line halfway through a purchase is a worse page than the one that was
   * approved.
   *
   * Null average for a business nobody has reviewed, never 0 — see
   * `serviceReadModel.providerRatingAverage` for that argument in full.
   */
  providerVerified: z.boolean(),
  providerRatingAverage: z.number().nullable(),

  /**
   * A picture of what was booked, and of who is doing it — the service's
   * first image and the business's logo, as URLs already resolved.
   *
   * **Live, like the badge and the score above, and for the same reason:**
   * neither is a term of the agreement. A provider who replaces a blurry
   * photo should have the better one show on the bookings it already has;
   * nobody is worse off for it, which is exactly the test that separates
   * these from `optionName` and `priceMinor`.
   *
   * **Only the first image, not the array.** The two screens that read this
   * — the customer's list row and the top of their booking's own page —
   * draw one thumbnail each. Carrying every key so both could ignore all but
   * the first would put a gallery on the wire for every row of every page.
   *
   * Null covers three cases the reader cannot tell apart and does not need
   * to: no image was ever uploaded, the key resolves to no URL because
   * nothing serves the bucket (`mediaUrl` answers null), and — for the
   * service only — the `leftJoin` found nothing, which the `NOT NULL` FK
   * makes unreachable. All three mean the same thing to a card: draw the
   * placeholder.
   */
  serviceImageUrl: z.string().nullable(),
  providerLogoUrl: z.string().nullable(),

  optionName: z.string(),
  durationMinutes: z.number().int().positive(),

  /**
   * Where the work happens — a `ServiceLocationType`, joined live off the
   * service rather than snapshotted.
   *
   * It is here because checkout's rail prints `Em sua casa · 240 min` under
   * the appointment, and decides from the same value whether
   * "Deslocação — Incluída" is a true sentence: the provider travels for
   * `at_customer` and `flexible` and nobody travels for `at_provider` or
   * `remote`, so telling a customer their travel is included when they are
   * the one travelling would be a false claim about money. Step 1 reads it
   * off `serviceDetailReadModel`; steps 2 and 3 have only the booking, and
   * before this the line was simply absent on two of the three pages of one
   * flow.
   *
   * **Live is wrong here, and unlike `providerVerified` above that is a gap
   * rather than a decision — see follow-up #119.** The badge and the score
   * are what the platform asserts about a business *today*, and freezing them
   * would keep claiming a withdrawn document. Where the work happens is not
   * that: it is a **term of what the customer agreed to**, in the same class
   * as `optionName` and `priceMinor`, which this schema snapshots. A provider
   * who switches a service from `at_customer` to `at_provider` must not
   * rewrite where an existing booking is happening — a customer who agreed to
   * a callout would be shown a shopfront, and the "Deslocação — Incluída"
   * line they were quoted on would vanish from the same booking. It is live
   * only because snapshotting it needs a column and a migration, and the
   * change that added it was a visual pass. The same argument #113 makes
   * about `timezone`, on a field where the drift is visible rather than
   * subtle.
   *
   * **Nullable because the join is a `leftJoin`, not because a service can
   * lack one.** `service.location_type` is `NOT NULL` and
   * `booking.service_id` is a `NOT NULL` FK with no cascade, so no row this
   * query can reach has a null here. The left join is the cheap side of an
   * asymmetric bet: an inner join that ever failed to match would make a
   * booking **disappear from its own customer's checkout** — a page that then
   * says nothing is being held for them — and fail nothing on the way. The
   * consumer already has to handle the null anyway, because the rail is
   * shared with a caller that has no location type to give.
   */
  locationType: z.string().nullable(),

  priceMinor: z.number().int().min(0),
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
   * **Not part of the snapshot today: it is an `innerJoin` on `provider`,
   * read live. That is a gap, not a decision — see follow-up #113.**
   *
   * The argument that put it here was that this is the same class of field as
   * `serviceId`, whose identity cannot drift. It is not. `serviceId` names a
   * row; `provider.timezone` is a *mutable attribute* of one, in the same
   * class as `provider.name` — which this schema snapshots, and which a
   * provider edits on the very page they manage their calendar from.
   *
   * The case that decides it is a provider who relocates while still serving
   * the same city. The instant does not move; `startsAt` is a `timestamptz`.
   * The words do. A customer who agreed to "Sábado às 14:00" in Maputo, whose
   * provider has since moved to Lisbon, is shown 13:00 — a wall clock
   * matching neither what was agreed nor where the work happens. Sharper
   * still for an `at_customer` service, where the relevant civil clock was
   * never the provider's to begin with: "the provider moved zone, so the
   * appointment moved too" is true for a shopfront and false for a callout.
   *
   * Snapshotting it is #113's own work and is deliberately not done here. The
   * value this field carries is byte-identical either way, which is what
   * makes the change safe to defer — and why nobody notices it is outstanding
   * unless this comment says so.
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
   * design's five clocks its status is standing on**, not the payment window
   * in particular. Each hop stamps this column with its own clock's deadline,
   * in the order a booking meets them:
   *
   * - `DRAFT` — the checkout hold.
   * - `AWAITING_PROVIDER` — the provider's response window.
   * - `PENDING_PAYMENT` — the payment window.
   * - `CONFIRMED` — the platform's question to the provider. Paying parks it
   *   on the appointment's own `endsAt`, which is when the platform first
   *   asks "how did it go"; each ask, and each "still going" answering one,
   *   pushes it seven days further out. So a confirmed booking's date runs
   *   from the end of the work rather than from anything the customer did.
   * - `MARKED_DONE` — **the customer's window to dispute**, three days from
   *   the moment the provider (or the platform on their behalf) said the work
   *   was done. This is the one a customer screen counts down.
   *
   * The first three cap their deadline at `startsAt` — a slot is never held
   * past its own start. The last two are the opposite: both begin at or after
   * `endsAt`, so on those two statuses this date is normally **ahead**, not
   * behind.
   *
   * **Read the status first, because the column is handed on rather than
   * reset.** Every hop overwrites the previous hop's deadline with its own,
   * and nothing wipes it on the way to a terminal status — a `COMPLETED`
   * booking still carries the feedback window that closed, an `EXPIRED` one
   * the window it ran out of. That is deliberate: a customer disputing "you
   * gave my slot away" needs the deadline they were actually given, and the
   * window lengths are live settings that cannot reconstruct it afterwards
   * (see `BookingProps.expiresAt` in the backend for the full argument). So a
   * consumer that trusts the date alone will show an expired timer on a
   * booking that is finished, and — since the two live clocks were added —
   * will equally miss a *running* one it should be showing. Check `status`
   * against the five above before rendering anything.
   *
   * **One transition clears it, and the null is a fact rather than a gap.**
   * `Booking.dispute` nulls this column: the customer complained inside their
   * window, an administrator is reading the case, and nobody is on a clock
   * until they decide. `DISPUTED` is therefore the one status where null
   * means "no deadline" rather than "never stamped", and the `COMPLETED` or
   * `CANCELLED` booking an administrator resolves it into keeps that null,
   * because nothing re-stamps the column afterwards. Otherwise null would
   * mean a column nothing ever wrote, which no hop produces today: `create`
   * takes the checkout hold as an argument and always stamps it. It stays
   * nullable because the column is.
   */
  expiresAt: z.string().nullable(),

  /**
   * When the payment landed, or null while it has not.
   *
   * The customer's own fact, unlike `paymentRef`, which stays off this model:
   * a gateway reference identifies a transaction to whoever has to chase it,
   * and the customer chasing it does so through support, who read it from the
   * provider's side.
   */
  paidAt: z.string().nullable(),

  createdAt: z.string(),
});

export type BookingDTO = z.infer<typeof bookingReadModel>;

/**
 * One hop in a booking's history, read by both audiences.
 *
 * It lived beside the provider's models until the customer's page needed the
 * same list. Neither audience owns it, so it sits with the model that is
 * neither — and `provider-booking.schema.ts` re-exports it so nothing that
 * imports it from there has to move.
 */
export const bookingTimelineEntryReadModel = z.object({
  at: z.string(),
  /** A machine token — `booking_change.reason`, or one of the two this read adds: `created_by_customer`, `respond_by`, `pay_by`. */
  reason: z.string().min(1),
  actor: z.enum(["customer", "provider", "system"]),
  /** A deadline still ahead, drawn hollow. */
  pending: z.boolean(),
});

/**
 * One page of the customer's own bookings, plus what the tab chips render.
 *
 * All three counts on every read, rather than three requests: the chips are
 * on screen whichever tab is open, and a count fetched per tab would show a
 * stale number on the two the customer is not looking at.
 */
export const customerBookingPageReadModel = z.object({
  items: z.array(bookingReadModel),
  /** Rows in the requested tab, unpaged — the pager's denominator. */
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
  counts: z.object({
    waiting: z.number().int().min(0),
    upcoming: z.number().int().min(0),
    history: z.number().int().min(0),
  }),
});
export type CustomerBookingPageDTO = z.infer<typeof customerBookingPageReadModel>;

/** One booking, for the page that tells its story. */
export const customerBookingDetailReadModel = bookingReadModel.extend({
  timeline: z.array(bookingTimelineEntryReadModel),
});
export type CustomerBookingDetailDTO = z.infer<typeof customerBookingDetailReadModel>;
