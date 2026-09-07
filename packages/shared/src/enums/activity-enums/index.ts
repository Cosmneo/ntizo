/**
 * Every kind of thing this platform records a person as having done.
 *
 * A closed list, not a free string. An unknown type reaching the table is a
 * row the interface renders as its own key — the reader sees
 * "activityType.somethingNew" where a sentence should be.
 *
 * Here, in the shared package, rather than in the Activity bounded context
 * where it started: the admin's activity list filters by type, and the picker
 * that offers the types and the field that validates them have to read one
 * list. The context re-exports it, so nothing on the write side moved.
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
