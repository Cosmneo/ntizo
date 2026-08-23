// User BC domain events.
//
// Shaped exactly like `bounded-contexts/provider/domain/events/index.ts`:
// each class extends the kit's `BaseDomainEvent`, which supplies a stable
// `eventId`, an `occurredOn`, and a frozen `payload` from
// `super(eventName, aggregateId, payload)`. The `aggregateId` is the user's
// own id — the thing the event is about, not the whole payload.
//
// The string passed as `eventName` becomes the outbox's `event_type` column
// and the key the `EventRouter` fans out on. Renaming one silently orphans
// every consumer written against it.

import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * Somebody finished signing up.
 *
 * The User context's first domain event — it had no event-recording machinery
 * at all, which is why `NotificationType.Welcome` had no producer.
 *
 * It carries the first name because the notification that reacts to it greets
 * somebody by it. A handler that had to go and look the name up would tie an
 * inbox row written once to a profile that can be edited a minute later, and
 * the row would then silently change what it said about the past. `null` is a
 * real case: better-auth defaults a missing name to `""`, which the producer
 * normalises away rather than passing on — see
 * `CreateUserOnSignUpInternalCommand`.
 *
 * `ProfileUpgradedToProvider` is deliberately not here. Nothing listens for
 * it, and an event with no listener is how dead surface starts.
 */
export class UserRegistered extends BaseDomainEvent<{
  userId: string;
  email: string;
  firstName: string | null;
}> {
  constructor(payload: { userId: string; email: string; firstName: string | null }) {
    super("user.registered", payload.userId, payload);
  }
}
