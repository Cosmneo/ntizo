import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * A booking slot was held: a price was agreed and a customer holds a right
 * to that slot until payment or expiry.
 *
 * Raised when a new booking enters the database in PendingPayment status.
 */
export class BookingCreated extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  startsAt: Date;
  priceMinor: number;
  currency: string;
  expiresAt: Date;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
    serviceId: string;
    startsAt: Date;
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
 * Raised when a booking transitions to Paid status. The Payment context
 * supplies the transaction reference that this event carries.
 */
export class BookingPaid extends BaseDomainEvent<{
  bookingId: string;
  customerId: string;
  providerId: string;
  priceMinor: number;
  commissionMinor: number;
  currency: string;
  paymentRef: string;
}> {
  constructor(payload: {
    bookingId: string;
    customerId: string;
    providerId: string;
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
 * could.
 */
export class BookingExpired extends BaseDomainEvent<{
  bookingId: string;
  providerMemberId: string;
  startsAt: Date;
}> {
  constructor(payload: {
    bookingId: string;
    providerMemberId: string;
    startsAt: Date;
  }) {
    super("booking.expired", payload.bookingId, payload);
  }
}
