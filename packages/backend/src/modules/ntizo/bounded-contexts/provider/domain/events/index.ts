// Provider BC domain events.
// TODO(ntizo): wire to a real domain event dispatcher / outbox once
// the eventing infrastructure lands. For now they're pulled off the
// aggregate via `pullEvents()`.
//
// Each class extends the kit's `BaseDomainEvent`, which supplies a stable
// `eventId` (crypto.randomUUID() per instance), `occurredOn`, and a frozen
// `payload` — see `super(eventName, aggregateId, payload)` below. The
// `aggregateId` passed to `super()` is always the provider's own id: every
// one of these events is raised by the Provider aggregate, so it is the
// thing the event is about, not the whole payload.
//
// The string passed as `eventName` (e.g. "provider.created") becomes the
// outbox's `event_type` column (Task 5) — keep every one of these 9 strings
// byte-identical; renaming one silently orphans any consumer written
// against it.

import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

export class ProviderCreated extends BaseDomainEvent<{
  providerId: string;
  ownerUserId: string;
  type: "individual" | "organization";
}> {
  constructor(payload: {
    providerId: string;
    ownerUserId: string;
    type: "individual" | "organization";
  }) {
    super("provider.created", payload.providerId, payload);
  }
}

export class ProviderUpdated extends BaseDomainEvent<{ providerId: string }> {
  constructor(payload: { providerId: string }) {
    super("provider.updated", payload.providerId, payload);
  }
}

export class ProviderDeactivated extends BaseDomainEvent<{
  providerId: string;
}> {
  constructor(payload: { providerId: string }) {
    super("provider.deactivated", payload.providerId, payload);
  }
}

export class ProviderMemberAdded extends BaseDomainEvent<{
  providerId: string;
  userId: string;
  role: string;
}> {
  constructor(payload: { providerId: string; userId: string; role: string }) {
    super("provider.member.added", payload.providerId, payload);
  }
}

export class ProviderMemberRemoved extends BaseDomainEvent<{
  providerId: string;
  userId: string;
}> {
  constructor(payload: { providerId: string; userId: string }) {
    super("provider.member.removed", payload.providerId, payload);
  }
}

export class ProviderMemberRoleUpdated extends BaseDomainEvent<{
  providerId: string;
  userId: string;
  role: string;
}> {
  constructor(payload: { providerId: string; userId: string; role: string }) {
    super("provider.member.role-updated", payload.providerId, payload);
  }
}

// Deliberately does NOT carry the invite's bearer `token`. This payload is
// written verbatim into `ntizo_outbox.outbox_event.payload` (plaintext
// jsonb, no consumer yet, no pruning), so anything placed here outlives the
// invite itself — including after the invite row is deleted. `inviteId` is
// enough for a future consumer to identify the invite; it is not a
// credential. Do not add `token` back without also adding redaction/pruning
// for the outbox table.
export class ProviderInviteSent extends BaseDomainEvent<{
  providerId: string;
  inviteId: string;
  email: string;
  role: string;
}> {
  constructor(payload: {
    providerId: string;
    inviteId: string;
    email: string;
    role: string;
  }) {
    super("provider.invite.sent", payload.providerId, payload);
  }
}

export class ProviderInviteAccepted extends BaseDomainEvent<{
  providerId: string;
  email: string;
  userId: string;
}> {
  constructor(payload: { providerId: string; email: string; userId: string }) {
    super("provider.invite.accepted", payload.providerId, payload);
  }
}

export class ProviderInviteRevoked extends BaseDomainEvent<{
  providerId: string;
  inviteId: string;
}> {
  constructor(payload: { providerId: string; inviteId: string }) {
    super("provider.invite.revoked", payload.providerId, payload);
  }
}
