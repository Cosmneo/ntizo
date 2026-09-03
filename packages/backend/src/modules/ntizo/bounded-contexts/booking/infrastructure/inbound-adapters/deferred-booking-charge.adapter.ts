import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import type { ChargeBookingInput } from "../../app/use-cases/charge-booking.command";
import type { ChargeBookingInternalPort } from "../../app/ports/inbound/charge-booking.internal.command.port";

/**
 * The gateway call, off the critical path — the same shape
 * `DeferredNotificationDelivery` uses for email, applied to a slower and
 * more consequential call.
 *
 * A C2B blocks for up to 110 seconds. `RequestBookingChargeCommand` runs
 * when a customer is looking at a "Pagar" button and waiting for a response;
 * nothing about that request should hold the connection open for two
 * minutes to find out whether a prompt reached a handset. This adapter is
 * what stands between the two: it starts `ChargeBookingCommand`, hands the
 * promise to `infraStore.waitUntil`, and returns immediately.
 *
 * **This class owns the failure log for the deferred path, and nothing else
 * can.** The moment the call is deferred, `RequestBookingChargeCommand`'s own
 * `await` resolves before the charge has even reached the processor, so any
 * `try`/`catch` there stops seeing anything the charge itself throws. The
 * `.catch` below is the real one — not decoration, an unhandled rejection
 * here would reach the Worker with nothing left to say about which booking
 * it was.
 *
 * `infraStore.waitUntil` needs no execution context to do the right thing —
 * see its own comment and `wait-until.test.ts`: outside a Worker (a test, a
 * script) the work still runs and is still waitable, there is simply no
 * platform to also tell about it. Nothing here has to branch on whether one
 * exists.
 */
export class DeferredBookingCharge implements ChargeBookingInternalPort {
  constructor(private readonly inner: ChargeBookingInternalPort) {}

  /**
   * Resolves once the charge has been *scheduled*, not once it has run —
   * the same distinction `DeferredNotificationDelivery.execute` draws.
   * Awaiting this tells a caller nothing about whether any prompt reached a
   * handset.
   */
  async execute(input: ChargeBookingInput): Promise<void> {
    infraStore.waitUntil(
      // Started here, inside the request's AsyncLocalStorage scope, so the
      // work that outlives the response still reads this request's env and
      // this request's database connection — nothing outside the scope
      // could start it.
      this.inner.execute(input).catch((error: unknown) => {
        // console.error, not the logger: getRequestScopedLogger() throws
        // when no scope is set, and by the time this runs the response is
        // already gone — a log line is the only remaining audience.
        console.error("[booking] a customer-initiated charge failed", {
          bookingId: input.bookingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  }
}
