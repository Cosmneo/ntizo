// Provider BC domain events.
// TODO(ntizo): wire to a real domain event dispatcher / outbox once
// the eventing infrastructure lands. For now they're plain plain DTOs
// pulled off the aggregate via `pullEvents()`.

export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

export class ProviderCreated implements DomainEvent {
  readonly name = "provider.created";
  readonly occurredAt = new Date();
  constructor(
    readonly payload: {
      providerId: string;
      ownerUserId: string;
      type: "individual" | "organization";
    },
  ) {}
}

export class ProviderUpdated implements DomainEvent {
  readonly name = "provider.updated";
  readonly occurredAt = new Date();
  constructor(readonly payload: { providerId: string }) {}
}

export class ProviderDeactivated implements DomainEvent {
  readonly name = "provider.deactivated";
  readonly occurredAt = new Date();
  constructor(readonly payload: { providerId: string }) {}
}

export class ProviderMemberAdded implements DomainEvent {
  readonly name = "provider.member.added";
  readonly occurredAt = new Date();
  constructor(
    readonly payload: { providerId: string; userId: string; role: string },
  ) {}
}

export class ProviderMemberRemoved implements DomainEvent {
  readonly name = "provider.member.removed";
  readonly occurredAt = new Date();
  constructor(readonly payload: { providerId: string; userId: string }) {}
}

export class ProviderMemberRoleUpdated implements DomainEvent {
  readonly name = "provider.member.role-updated";
  readonly occurredAt = new Date();
  constructor(
    readonly payload: { providerId: string; userId: string; role: string },
  ) {}
}

export class ProviderInviteSent implements DomainEvent {
  readonly name = "provider.invite.sent";
  readonly occurredAt = new Date();
  constructor(
    readonly payload: {
      providerId: string;
      email: string;
      token: string;
      role: string;
    },
  ) {}
}

export class ProviderInviteAccepted implements DomainEvent {
  readonly name = "provider.invite.accepted";
  readonly occurredAt = new Date();
  constructor(
    readonly payload: { providerId: string; email: string; userId: string },
  ) {}
}

export class ProviderInviteRevoked implements DomainEvent {
  readonly name = "provider.invite.revoked";
  readonly occurredAt = new Date();
  constructor(readonly payload: { providerId: string; inviteId: string }) {}
}
