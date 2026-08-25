import type { NotificationType } from "@ntizo/shared";

/**
 * Everything an email needs, carried rather than looked up.
 *
 * The same shape `RaiseNotificationInput` has, plus the id of the inbox row
 * that was just written — which is why the raise can hand its own input
 * straight through with the id spread on top, and why the payload travels as
 * a snapshot instead of as ids for a later reader to resolve.
 */
export type DeliverNotificationInternalInput = {
  /**
   * The inbox row this delivery belongs to. Null is legitimate: a delivery can
   * exist for an address with no notification behind it, and the column is
   * `ON DELETE SET NULL` besides.
   */
  notificationId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
} & ({ audience: "user"; userId: string } | { audience: "provider"; providerId: string });

/**
 * Turning a raised notification into email.
 *
 * A port rather than the sibling class so `RaiseNotificationInternalCommand`
 * depends on the capability and not on its own neighbour — and, more to the
 * point, so what it depends on can be a *decorator*. The bootstrap wraps the
 * real command in one that hands delivery to `infraStore.waitUntil` and
 * returns immediately; the raise command must not be able to tell the
 * difference, because *when* delivery runs is a wiring decision and not
 * something a use case should know.
 *
 * **The result is not part of the contract.** The concrete command returns the
 * ids of the rows it wrote. A deferring implementation returns before any of
 * them exist and has nothing to report, so this is typed `unknown`: no caller
 * can build on a result the wiring is free to make meaningless. Call
 * `DeliverNotificationInternalCommand` directly and await it when the ids
 * matter — the tests do exactly that.
 *
 * **No implementation may throw at its caller.** The concrete command says so
 * in its own doc and means it; a deferring one has an even harder duty, since
 * by the time it fails its caller has returned and there is nobody left to
 * throw at. Failures are logged where they happen and recorded on the delivery
 * rows themselves.
 */
export interface DeliverNotificationInternalPort {
  execute(input: DeliverNotificationInternalInput): Promise<unknown>;
}
