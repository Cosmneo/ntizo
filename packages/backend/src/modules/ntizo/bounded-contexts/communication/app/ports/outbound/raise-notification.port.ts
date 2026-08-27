import type { NotificationType } from "@ntizo/shared";

/**
 * What raising a notification looks like from this side of the boundary.
 *
 * The same discriminated union `RaiseNotificationInput` in
 * `bounded-contexts/notification/app/use-cases/raise-notification.internal.command.ts`
 * already is — declared again here rather than imported from it. No file
 * under any bounded context's `app/` tree imports from another context's
 * `app/` tree anywhere in this codebase: `ProviderReaderPort` (this same
 * context, reading Provider) and `ProviderMemberReaderPort` (Notification's,
 * reading Provider) both declare their own shape instead of reaching into the
 * other side's types, and this follows the same rule for a write instead of a
 * read.
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
 * An outbound port rather than an import of the Notification context:
 * Communication must not reach into another bounded context's use cases, and
 * the composition root that wires the real `RaiseNotificationInternalCommand`
 * in here is the one place the coupling is written down. That command
 * satisfies this interface structurally — it needs no `implements` clause and
 * no adapter class, because raising a notification is already exactly this
 * shape on the other side.
 */
export interface RaiseNotificationInternalPort {
  execute(input: RaiseNotificationInput): Promise<{ notificationId: string }>;
}
