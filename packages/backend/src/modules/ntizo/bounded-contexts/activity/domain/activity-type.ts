/**
 * Every kind of thing this platform records a person as having done.
 *
 * A closed list, not a free string. An unknown type reaching the table is a
 * row the interface renders as its own key — the reader sees
 * "activityType.somethingNew" where a sentence should be.
 *
 * Some domain events deliberately produce no activity row.
 *
 * `provider.updated` and `service.updated` say nothing a person would read
 * back — updated what? — and a feed of them buries the entries that mean
 * something.
 *
 * `member.added`, `member.removed`, `invite.declined` and `invite.revoked`
 * are the other side of an action already recorded: `invite.sent` sits in
 * the inviter's history and `invite.accepted` in the invitee's, so logging
 * the membership too would write the same moment three times.
 *
 * `provider.deactivated` and `provider.member.role-updated` carry no actor
 * on their payload, so there is nobody to file the row under. Giving one an
 * actor is a product decision for whichever phase decides it is worth
 * recording — not a gap in this list, and not this phase's to make by
 * default.
 */
export const ACTIVITY_TYPES = [
  "user.registered",
  "provider.created",
  "provider.status.decided",
  "provider.invite.sent",
  "provider.invite.accepted",
  "service.created",
  "service.published",
  "service.unpublished",
  "review.created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
