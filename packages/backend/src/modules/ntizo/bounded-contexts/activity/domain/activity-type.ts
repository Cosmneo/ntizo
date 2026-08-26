/**
 * Every kind of thing this platform records a person as having done.
 *
 * A closed list, not a free string. An unknown type reaching the table is a
 * row the interface renders as its own key — the reader sees
 * "activityType.somethingNew" where a sentence should be.
 *
 * Six of the fifteen domain events are deliberately absent. `provider.updated`
 * and `service.updated` say nothing a person would read back — updated what? —
 * and a feed of them buries the entries that mean something. `member.added`,
 * `member.removed`, `invite.declined` and `invite.revoked` are the other side
 * of an action already recorded: `invite.sent` sits in the inviter's history
 * and `invite.accepted` in the invitee's, so logging the membership too would
 * write the same moment three times.
 */
export const ACTIVITY_TYPES = [
  "user.registered",
  "provider.created",
  "provider.statusDecided",
  "provider.inviteSent",
  "provider.inviteAccepted",
  "service.created",
  "service.published",
  "service.unpublished",
  "review.created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
