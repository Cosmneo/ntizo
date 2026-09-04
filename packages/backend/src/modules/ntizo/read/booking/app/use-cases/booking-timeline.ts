import type { BookingTimelineEntryDTO } from "@ntizo/shared/read-models";

/** The three columns a hop is built from, whichever row shape carried them. */
export interface TimelineChangeRow {
  changedAt: Date;
  changedByUserId: string | null;
  reason: string;
}

/** Everything the assembly needs off the booking, from either audience's row. */
export interface TimelineSubject {
  createdAt: Date;
  customerId: string;
  status: string;
  expiresAt: Date | null;
}

/**
 * Creation first, then every recorded hop, then — while a clock is running —
 * the deadline still ahead, drawn hollow.
 *
 * The actor is derived, not stored: a null `changedByUserId` is a machine
 * hop, the booking's own customer is the customer, and anyone else is
 * somebody in the workspace.
 *
 * Both audiences read the same list. It lived in `to-provider-booking-dto.ts`
 * until the customer's page needed it; a second copy would be a second place
 * for the two sides of one booking to start disagreeing about its history.
 */
export function timelineOf(
  subject: TimelineSubject,
  changes: readonly TimelineChangeRow[],
  now: Date,
): BookingTimelineEntryDTO[] {
  const entries: BookingTimelineEntryDTO[] = [
    { at: subject.createdAt.toISOString(), reason: "created_by_customer", actor: "customer", pending: false },
    ...changes.map((c) => ({
      at: c.changedAt.toISOString(),
      reason: c.reason,
      actor:
        c.changedByUserId === null
          ? ("system" as const)
          : c.changedByUserId === subject.customerId
            ? ("customer" as const)
            : ("provider" as const),
      pending: false,
    })),
  ];

  const clock =
    subject.status === "AWAITING_PROVIDER" ? "respond_by" : subject.status === "PENDING_PAYMENT" ? "pay_by" : null;
  if (clock && subject.expiresAt && subject.expiresAt.getTime() > now.getTime()) {
    entries.push({ at: subject.expiresAt.toISOString(), reason: clock, actor: "system", pending: true });
  }
  return entries;
}
