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
 * Raised when a booking transitions to AwaitingProvider status. The booking
 * is now paid but not yet confirmed — the provider still has to answer. It
 * carries the member and the slot for the same reason `BookingCreated`
 * does: Notification's "you're paid, awaiting confirmation" message has to
 * name a time and cannot without reading the booking back, and that read
 * is exactly what this field earns its keep by avoiding. The Payment
 * context supplies the transaction reference that this event carries.
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
