import type { ChargeBookingInput } from "../../use-cases/charge-booking.command";

/**
 * Pushing a payment prompt at one booking's customer — the capability
 * `RequestBookingChargeCommand` depends on, rather than depending on
 * `ChargeBookingCommand` itself.
 *
 * A port, not the sibling command, for the exact reason
 * `DeliverNotificationInternalPort` is one and not
 * `DeliverNotificationInternalCommand`: in production this is a decorator
 * that hands the call to `infraStore.waitUntil` and returns before it
 * finishes, because a C2B blocks for up to 110 seconds and nobody may watch
 * that from a request. `RequestBookingChargeCommand` must not be able to
 * tell which implementation it was given — *when* the gateway call actually
 * runs is a wiring decision, made once, in `bootstrapBooking`, and a test
 * can have either by choosing what it constructs.
 *
 * **The result is not part of the contract**, again matching
 * `DeliverNotificationInternalPort`: a deferring implementation resolves
 * once the work is *scheduled*, not once it is done, so there is nothing
 * true to report back. `ChargeAcceptedBookingsInternalCommand` calls
 * `ChargeBookingCommand` directly and awaits it for real, because the cron
 * sweep has nobody waiting on a response to protect and every reason to know
 * what actually happened to the booking it just charged.
 */
export interface ChargeBookingInternalPort {
  execute(input: ChargeBookingInput): Promise<void>;
}
