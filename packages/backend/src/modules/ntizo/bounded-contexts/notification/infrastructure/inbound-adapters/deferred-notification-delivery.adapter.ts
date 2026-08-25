import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import type {
  DeliverNotificationInternalInput,
  DeliverNotificationInternalPort,
} from "../../app/ports/inbound/deliver-notification.internal.command.port";

/**
 * Delivery, off the critical path.
 *
 * Rendering an email and posting it to Resend is hundreds of milliseconds. A
 * provider approval, a sign-up, an invitation — none of them should pay for
 * that, and none of them should fail because of it. So this stands between
 * `RaiseNotificationInternalCommand` and the real delivery command: it starts
 * the work, hands the promise to `infraStore.waitUntil`, and returns.
 *
 * A decorator rather than an `infraStore` import inside the use case, because
 * *when* something runs is a wiring decision. The use case stays a description
 * of what happens; the bootstrap decides whether it happens now or after the
 * response, and a test can have either by choosing what it constructs.
 *
 * **This class owns the failure log for the deferred path, and nothing else
 * can.** The moment delivery is deferred, the raise command's `await` resolves
 * immediately and its try/catch stops seeing anything — a guard that looks
 * like it guards and does not. The `.catch` below is the real one. It is not
 * decoration for a command documented never to throw: "never throws" is a
 * promise made by code, and an unhandled rejection here reaches Cloudflare
 * with nothing left to say about where it came from.
 *
 * The pool it needs outlives it on purpose: `infraStore.waitUntil` records
 * this promise so `configMiddleware` can close the per-request postgres
 * connection *behind* it rather than beside it. See `settleDeferredWork`.
 */
export class DeferredNotificationDelivery implements DeliverNotificationInternalPort {
  constructor(private readonly inner: DeliverNotificationInternalPort) {}

  /**
   * Resolves once delivery has been *scheduled*, not once it has happened —
   * which is why the port promises no usable result. Awaiting this tells a
   * caller nothing about whether any email went out.
   */
  async execute(input: DeliverNotificationInternalInput): Promise<void> {
    infraStore.waitUntil(
      // Started here, inside the request's AsyncLocalStorage scope, so the
      // work that follows the response still reads this request's env and
      // this request's database connection. Nothing outside the scope could
      // start it.
      this.inner.execute(input).catch((error: unknown) => {
        // console.error, not the logger: getRequestScopedLogger() throws when
        // no scope is set and nothing in this repo ever sets one —
        // tx-context.ts:21 does the same for the same reason. And by the time
        // this runs the response is gone, so a log line is the entire
        // remaining audience for the failure.
        console.error("[notification] deferred delivery failed", {
          notificationId: input.notificationId,
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  }
}
