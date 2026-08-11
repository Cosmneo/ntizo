import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

// The string passed as `eventName` becomes the outbox's `event_type` column —
// keep them byte-identical; renaming one silently orphans any consumer.

export class ServiceCreated extends BaseDomainEvent<{
  serviceId: string;
  providerId: string;
}> {
  constructor(payload: { serviceId: string; providerId: string }) {
    super("service.created", payload.serviceId, payload);
  }
}

export class ServiceUpdated extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.updated", payload.serviceId, payload);
  }
}

export class ServicePublished extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.published", payload.serviceId, payload);
  }
}

export class ServiceUnpublished extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.unpublished", payload.serviceId, payload);
  }
}
