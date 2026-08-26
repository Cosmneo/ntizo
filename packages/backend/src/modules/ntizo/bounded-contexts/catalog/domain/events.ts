import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

// The string passed as `eventName` becomes the outbox's `event_type` column —
// keep them byte-identical; renaming one silently orphans any consumer.

/**
 * `actorUserId` is who did it, and is separate from `providerId`, which is
 * whose it is. A workspace has several members and "the provider published
 * this" cannot say which of them to put it in front of.
 */
export class ServiceCreated extends BaseDomainEvent<{
  serviceId: string;
  providerId: string;
  actorUserId: string;
}> {
  constructor(payload: { serviceId: string; providerId: string; actorUserId: string }) {
    super("service.created", payload.serviceId, payload);
  }
}

export class ServiceUpdated extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.updated", payload.serviceId, payload);
  }
}

/**
 * `actorUserId` is who did it, and is separate from `providerId`, which is
 * whose it is. A workspace has several members and "the provider published
 * this" cannot say which of them to put it in front of.
 */
export class ServicePublished extends BaseDomainEvent<{
  serviceId: string;
  actorUserId: string;
}> {
  constructor(payload: { serviceId: string; actorUserId: string }) {
    super("service.published", payload.serviceId, payload);
  }
}

/**
 * `actorUserId` is who did it, and is separate from `providerId`, which is
 * whose it is. A workspace has several members and "the provider published
 * this" cannot say which of them to put it in front of.
 */
export class ServiceUnpublished extends BaseDomainEvent<{
  serviceId: string;
  actorUserId: string;
}> {
  constructor(payload: { serviceId: string; actorUserId: string }) {
    super("service.unpublished", payload.serviceId, payload);
  }
}
