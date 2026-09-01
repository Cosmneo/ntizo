import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * A booking slot was held: a price was agreed and a customer holds a right
 * to that slot until payment or expiry.
 *
 * Raised when a new booking enters the database in PendingPayment status. It
 * carries the provider member and the slot's end so a consumer marking a slot
 * held at creation does not have to read the booking back to learn which
 * member's calendar it occupies or when the slot ends — a read that would
 * reintroduce the same drift the booking snapshot exists to prevent (the
 * aggregate is immutable by design so a later catalog edit cannot rewrite
 * what a customer bought, and a consumer re-deriving the duration from the
 * live catalog would lose that guarantee).
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
 * A booking's hold expired before payment was confirmed.
 *
 * Raised when a booking transitions to Expired status. It carries the member
 * and the start rather than only the booking id because its consumer is
 * Scheduling, which has a slot to release — an event that made it read the
 * booking back to learn which one would be an event that knows less than it
 * could. It carries the customer id for the same reason, aimed at a
 * different consumer: Notification cannot tell a customer their booking
 * expired without knowing which customer, and the booking id alone does not
 * say that.
 */
export class BookingExpired extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerMemberId: string;
  startsAt: Date;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerMemberId: string;
    startsAt: Date;
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
 * not carry a payment deadline: `accept` does not set one (see its own doc
 * comment), so there is nothing accurate here to publish.
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
 * in the first place. Three members, though only one has a call site yet: a
 * `PENDING_PAYMENT` booking swept past its payment window
 * (`"payment_not_received"` — the case the spec's own failure section
 * exists for, and the only reason any task in this plan raises). The other
 * two, `"customer_cancelled"` and `"provider_cancelled"`, are what a
 * cancellation policy will eventually reach for once one exists — declared
 * now, alongside the event, rather than deferred to whichever task builds
 * that policy, so that work extends this union instead of reopening it.
 */
export type BookingCancelledReason = "payment_not_received" | "customer_cancelled" | "provider_cancelled";

/**
 * A booking was called off after it had already committed a provider's
 * calendar, a customer's money, or both.
 *
 * Raised when a booking transitions to Cancelled status. Unlike
 * `BookingExpired` — which only ever means "nobody showed up to pay before
 * anyone committed anything" — a cancellation can land after either party
 * has already acted, so the audience depends on which of the three
 * `BookingCancelledReason`s applies: `payment_not_received` is told to the
 * provider, who blocked a slot for money that never arrived; a hypothetical
 * `provider_cancelled` would be told to the customer instead. Rather than
 * guess which one, this event carries both `customerId` and `providerId`
 * and leaves the choice to the consumer reading `reason`.
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
