import type { NotificationType } from "@ntizo/shared";

/**
 * What raising a notification looks like from this side of the boundary —
 * the same discriminated union `RaiseNotificationInput` in the notification
 * context is, declared again here rather than imported, exactly as
 * `bounded-contexts/communication/app/ports/outbound/raise-notification.port.ts`
 * does and for the reason written there: no `app/` tree imports another
 * context's `app/` tree.
 *
 * The discriminated union rather than nullable ids, for the same reason the
 * source type has one: a caller cannot express "both" or "neither" without
 * the compiler stopping them.
 */
export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | {
      type: NotificationType;
      audience: "provider";
      providerId: string;
      payload: Record<string, unknown>;
    };

/**
 * An outbound port rather than an import of the Notification context: this
 * context must not reach into another bounded context's use cases, and the
 * composition root that wires the real `RaiseNotificationInternalCommand` in
 * here is the one place the coupling is written down. That command satisfies
 * this interface structurally — no `implements` clause and no adapter class,
 * because raising a notification is already exactly this shape on the other
 * side.
 */
export interface RaiseNotificationInternalPort {
  execute(input: RaiseNotificationInput): Promise<{ notificationId: string }>;
}

/**
 * Raise, and never let it fail the write that just committed. A request that
 * was accepted and not announced is recoverable; one un-accepted because an
 * email adapter hiccupped is not (BR-P6). Logged with the booking id so a
 * missing announcement can be found.
 *
 * `console.error` rather than the request-scoped logger, for the same reason
 * `notify-unread.internal.command.ts` uses it: the sweep raises from a cron
 * invocation, which sets no request scope for `getRequestScopedLogger()` to
 * read, and a logger that throws inside the one place built never to throw
 * would defeat the whole point of this function.
 */
export async function raiseQuietly(
  port: RaiseNotificationInternalPort,
  input: RaiseNotificationInput,
  bookingId: string,
): Promise<void> {
  try {
    await port.execute(input);
  } catch (error) {
    console.error(`[booking] notification ${input.type} for ${bookingId} not raised`, error);
  }
}
