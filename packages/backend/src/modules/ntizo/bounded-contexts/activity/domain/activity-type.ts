/**
 * Every kind of thing this platform records a person as having done.
 *
 * The list itself lives in `@ntizo/shared` (`ACTIVITY_TYPES`), because the
 * admin's activity list filters by type and the picker that offers the types
 * and the field that validates them have to read one list. Re-exported here
 * so the write side keeps naming it as its own, which it is.
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
export { ACTIVITY_TYPES, isActivityType, type ActivityType } from "@ntizo/shared";
