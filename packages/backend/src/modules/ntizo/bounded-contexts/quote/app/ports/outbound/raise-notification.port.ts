import type { NotificationType } from "@ntizo/shared";

/**
 * What raising a notification looks like from this side of the boundary —
 * the same discriminated union `RaiseNotificationInput` in the notification
 * context is, declared again here rather than imported, exactly as
 * `bounded-contexts/booking/app/ports/outbound/raise-notification.port.ts`
 * does and for the reason written there: no `app/` tree imports another
 * context's `app/` tree.
 *
 * The discriminated union rather than nullable ids, for the same reason the
 * source type has one: a caller cannot express "both" or "neither" without
 * the compiler stopping them.
 */
export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | { type: NotificationType; audience: "provider"; providerId: string; payload: Record<string, unknown> };

/**
 * An outbound port rather than an import of the Notification context: this
 * context must not reach into another bounded context's use cases, and the
 * composition root that wires the real notification command in here is the
 * one place the coupling is written down.
 */
export interface RaiseNotificationInternalPort {
  execute(input: RaiseNotificationInput): Promise<{ notificationId: string }>;
}

/** A notification that fails to raise never fails the write (BR-Q10). */
export async function raiseQuietly(
  port: RaiseNotificationInternalPort,
  input: RaiseNotificationInput,
  quoteId: string,
): Promise<void> {
  try {
    await port.execute(input);
  } catch (error) {
    console.error(`[quote] notification ${input.type} for ${quoteId} not raised`, error);
  }
}
