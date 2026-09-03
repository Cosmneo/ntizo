import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * A booking slot was held: a price was agreed and a customer holds a right
 * to that slot until the checkout hold expires, they submit it to the
 * provider, or they abandon it.
 *
 * Raised when a new booking enters the database in `DRAFT` status —
 * `expiresAt` here is the checkout hold (`checkout_hold_minutes`), not a
 * payment deadline: no provider has been asked yet, and no money is
 * involved until `BookingSubmitted` and `BookingAccepted` follow. It
 * carries the provider member and the slot's end so a consumer marking a
 * slot held at creation does not have to read the booking back to learn
 * which member's calendar it occupies or when the slot ends — a read that
 * would reintroduce the same drift the booking snapshot exists to prevent
 * (the aggregate is immutable by design so a later catalog edit cannot
 * rewrite what a customer bought, and a consumer re-deriving the duration
 * from the live catalog would lose that guarantee).
 */
export class BookingCreated extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  endsAt: Date;
  priceMinor: number;
  currency: string;
  expiresAt: Date;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    serviceId: string;
    providerMemberId: string;
    startsAt: Date;
    endsAt: Date;
    priceMinor: number;
    currency: string;
    expiresAt: Date;
  }) {
    super("booking.created", payload.bookingId, payload);
  }
}

/**
 * The customer finished checkout and sent the request on to the provider —
 * the provider's response window (`provider_response_minutes`) starts here.
 *
 * Raised when a booking transitions to `AWAITING_PROVIDER` via `submit`.
 * Its natural consumer is Notification, rendering the provider's "you have
 * a new request" card — which is precisely where the amount and the
 * service belong, the same reasoning `BookingCreated` carries `serviceId`,
 * `priceMinor` and `currency` for. No consumer exists yet for either event;
 * that is exactly why adding the three here is cheap now and would not be
 * once one does — this codebase's own rule is that a consumer never reads
 * the booking back to learn what its own event could have told it. It also
 * needs the member and the slot for the same reason `BookingCreated` does:
 * reading the booking back to learn either would reintroduce the drift the
 * snapshot exists to prevent. `respondBy` is what `submit` actually wrote
 * onto `expiresAt` (see that method's own doc comment for why it takes the
 * deadline as an input rather than computing it) — carried under its own
 * name here rather than `expiresAt`, because "expiresAt" is a fact about
 * the row, not a name this payload owes any particular column.
 */
export class BookingSubmitted extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  providerMemberId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  priceMinor: number;
  currency: string;
  respondBy: Date;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    providerMemberId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    priceMinor: number;
    currency: string;
    respondBy: Date;
  }) {
    super("booking.submitted", payload.bookingId, payload);
  }
}

/**
 * A booking's payment was confirmed.
 *
 * Raised when a booking transitions to Confirmed status. By this point the
 * provider has already said yes — `accept` ran first, moving the booking to
 * `PendingPayment` — so a charge clearing here is the last step, not the
 * first: nobody still has to answer. It carries the member and the slot for
 * the same reason `BookingCreated` does: Notification's "you're confirmed"
 * message has to name a time and cannot without reading the booking back,
 * and that read is exactly what this field earns its keep by avoiding. The
 * Payment context supplies the transaction reference that this event
 * carries.
 */
export class BookingPaid extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  providerMemberId: string;
  startsAt: Date;
  endsAt: Date;
  priceMinor: number;
  commissionMinor: number;
  currency: string;
  paymentRef: string;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    providerMemberId: string;
    startsAt: Date;
    endsAt: Date;
    priceMinor: number;
    commissionMinor: number;
    currency: string;
    paymentRef: string;
  }) {
    super("booking.paid", payload.bookingId, payload);
  }
}

/**
 * Why a booking reached `EXPIRED` — the one fact a consumer of
 * `BookingExpired` cannot recover from the rest of the payload, and the one
 * that decides who hears about it at all.
 *
 * **Not `BookingExpiredClock`, which is what this was called.** Two of the
 * three members are clocks and the third is not: a `DRAFT` the customer
 * replaced by picking a different time did not run out of anything. Reported
 * under the nearest clock-shaped member — `checkout_hold` — this event would
 * state something false about why a slot came free, which is a worse defect
 * than a name that reads a little wider than two of its own members.
 *
 * Each cause has its own audience, and they are not one audience under
 * different labels. A `DRAFT` past its checkout hold means the customer
 * opened the form and walked away: nobody is told, because the only person
 * who could be told is the one who left. An `AWAITING_PROVIDER` past the
 * provider's response window means the customer did everything asked of
 * them and the provider never answered: the customer is told, and is owed
 * that message. A draft superseded by the customer's own next one tells
 * nobody either, for a different reason than the abandoned one: they did it
 * deliberately, seconds ago, by choosing another time. Same resulting
 * status, same transition, same event — different obligation, and nothing
 * the row keeps separates them, since it says `EXPIRED` in all three cases.
 * So the cause either rides on the event or is lost, and a consumer reading
 * the booking back to recover it is exactly what carrying a fact on an event
 * exists to make unnecessary.
 *
 * A closed union rather than free text, for the same reason
 * `BookingCancelledReason` is one: Notification renders into eight locales,
 * and a locale key can be switched on where a sentence cannot. The two
 * clocks are named after the `platform_settings` columns their deadlines
 * are read from — `checkout_hold_minutes` and `provider_response_minutes` —
 * so the value on the payload and the setting that produced it read as the
 * same fact. `superseded` has no such column behind it, which is why this
 * type no longer claims to be named after that table.
 *
 * There is deliberately no `payment_window` member. A payment window that
 * runs out does not produce this event at all: it produces
 * `BookingCancelled` carrying `customer_did_not_pay`, because a provider
 * who blocked their calendar for money that never arrived is owed a
 * cancellation with a reason rather than an expiry nobody explains. See the
 * design's failure section, and `Booking.cancel`.
 */
export type BookingExpiredCause = "checkout_hold" | "provider_response" | "superseded";

/**
 * A booking ended before anybody had committed money to it.
 *
 * Raised when a booking transitions to Expired status — from `DRAFT`, whose
 * checkout hold protected a customer still filling in the form, or from
 * `AWAITING_PROVIDER`, whose window protected that customer from a provider
 * who never answered, or from a `DRAFT` the customer superseded by starting
 * a new one on a different slot. `PENDING_PAYMENT` is not one of them: it
 * holds a calendar a provider has already committed, so it ends in
 * `BookingCancelled` instead (see `Booking.cancel` and
 * `BookingCancelledReason`).
 *
 * It carries the member and the start rather than only the booking id
 * because one of its consumers is Scheduling, which has a slot to release —
 * an event that made it read the booking back to learn which one would be
 * an event that knows less than it could. It carries the customer id for
 * the same reason, aimed at a different consumer: Notification cannot tell
 * a customer their booking expired without knowing which customer, and the
 * booking id alone does not say that. `cause` is what tells Notification
 * whether to tell them at all — see `BookingExpiredCause`.
 */
export class BookingExpired extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerMemberId: string;
  startsAt: Date;
  cause: BookingExpiredCause;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerMemberId: string;
    startsAt: Date;
    cause: BookingExpiredCause;
  }) {
    super("booking.expired", payload.bookingId, payload);
  }
}

/**
 * The provider said yes. No money has moved yet — that is the whole point
 * of the reversal this event is named for.
 *
 * Raised when a booking transitions to PendingPayment status via `accept`.
 * This is what starts the charge: the moment a provider commits their
 * calendar is the moment a charge against the customer becomes legitimate,
 * where before this plan a charge was attempted before anyone had agreed to
 * anything. The payload carries exactly what a charge needs — who to
 * charge (`customerId`), how much (`priceMinor`), and in what currency —
 * plus `providerId`, which the charge itself does not read but which keeps
 * this event and `BookingPaid` (the one that follows a successful charge)
 * symmetric for whichever consumer has to correlate the two.
 *
 * Deliberately narrower than `BookingPaid`: no `providerMemberId`, no
 * `startsAt`/`endsAt`. Those are calendar facts a charge has no use for,
 * and the seat those facts help identify **is never exposed in an event
 * payload** — padding this one with fields only a scheduling consumer
 * would want is the same mistake as leaving a real one out. It also does
 * not carry a payment deadline — not because there isn't one: `accept`
 * *does* set one, replacing `expiresAt` with `payBy` (see that method's own
 * doc comment), and the deadline lives on `booking.expiresAt` for whoever
 * needs to read it back. It is left off this payload because a charge has
 * no use for it either, the same reasoning that excludes the calendar
 * fields just above.
 */
export class BookingAccepted extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  priceMinor: number;
  currency: string;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    priceMinor: number;
    currency: string;
  }) {
    super("booking.accepted", payload.bookingId, payload);
  }
}

/**
 * The provider said no.
 *
 * Raised when a booking transitions to Declined status via `decline`. Two
 * consumers, two reasons for the same fields: Scheduling has a slot to
 * release — the same reasoning `BookingExpired` carries `providerMemberId`
 * and `startsAt` for, since a declined booking releases its member's
 * calendar exactly as an expired one does — and Notification has to tell
 * the customer their slot is gone, which needs `customerId` and, when the
 * provider gave one, `reason` to say why rather than leaving the customer
 * to guess.
 *
 * `reason` is the provider's own words, not the closed union
 * `BookingCancelled` carries. It does not need translating for Notification
 * the way a platform-generated reason does — the provider already wrote it
 * in whatever language they used — so free text is the right shape here,
 * not a defect this event should have designed away.
 */
export class BookingDeclined extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerMemberId: string;
  startsAt: Date;
  reason: string | null;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerMemberId: string;
    startsAt: Date;
    reason: string | null;
  }) {
    super("booking.declined", payload.bookingId, payload);
  }
}

/**
 * A booking's reason for reaching `CANCELLED`, closed rather than free
 * text.
 *
 * Notification has to translate this into eight locales, which free text
 * cannot survive — a provider-authored `reason` (see `BookingDeclined`)
 * does not face the same requirement because it is never machine-generated
 * in the first place.
 *
 * Two members, and each has a real producer. An earlier version of this
 * union also declared `"customer_cancelled"` and `"provider_cancelled"`, on
 * the theory that a cancellation policy would eventually want them and
 * declaring them now would save that work reopening this union later. That
 * reasoning is reversed here: neither member had a producer anywhere in
 * that plan, and the spec puts the cancellation policy explicitly out of
 * scope — whether either kind of cancellation even exists yet, let alone
 * what a customer or provider should be told about it, is a question nobody
 * has answered. Notification cannot render a locale string for a reason
 * nobody has designed, so carrying those two was a contract this codebase
 * could not keep, not a convenience.
 *
 * `"customer_did_not_pay"` is the sweep's: a `PENDING_PAYMENT` booking past
 * its payment window, the case the booking-core spec's failure section
 * exists for. `"dispute_upheld"` is an administrator's: a `DISPUTED`
 * booking whose dispute they sided with, which ends the booking as
 * `CANCELLED` rather than `COMPLETED` precisely so the wallet work can read
 * this reason later and know what *not* to pay out — see
 * `Booking.resolveDispute`. Note how differently they read to their
 * audiences, which is the whole argument for a closed union: one tells a
 * provider the customer never paid, the other tells them the platform
 * decided against them, and no single sentence covers both.
 *
 * When a cancellation policy lands, it will name its own reasons against
 * real rules it can actually enforce — extending this union then, rather
 * than guessing its shape now, is what makes an exhaustive `switch` over it,
 * and `CANCELLABLE_FROM` in the aggregate, go red at exactly the right
 * moment.
 */
export type BookingCancelledReason = "customer_did_not_pay" | "dispute_upheld";

/**
 * A booking was called off after it had already committed a provider's
 * calendar, a customer's money, or both.
 *
 * Raised when a booking transitions to Cancelled status. Unlike
 * `BookingExpired` — which only ever means "nobody showed up to pay before
 * anyone committed anything" — a cancellation can land after either party
 * has already acted. Its two reasons reach different people.
 * `customer_did_not_pay` is the provider's news: they blocked a slot for
 * money that never arrived. `dispute_upheld` is both sides' — see
 * `NotificationType.BookingDisputeResolved`, whose own comment says "both
 * sides hear the same thing" — which is what finally earns the `customerId`
 * this event has carried since before any reason needed it, on the
 * argument that a future reason would.
 *
 * Carries `providerMemberId` and `startsAt` for the same reason
 * `BookingExpired` and `BookingDeclined` do: `CANCELLED` is not one of
 * `SLOT_HOLDING_STATUSES`, so cancelling releases the member's calendar,
 * and Scheduling needs to know which slot without reading the booking
 * back. Carries no money: refunding a successful charge is explicitly out
 * of this plan's scope (see the design's own "Refunds" section), and this
 * event is not the seam that decision will use.
 */
export class BookingCancelled extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  providerMemberId: string;
  startsAt: Date;
  reason: BookingCancelledReason;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    providerMemberId: string;
    startsAt: Date;
    reason: BookingCancelledReason;
  }) {
    super("booking.cancelled", payload.bookingId, payload);
  }
}
