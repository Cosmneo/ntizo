import { beforeEach, describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type {
  RecordActivityInternalInput,
  RecordActivityInternalPort,
} from "../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";
import type { ProviderNameReaderPort } from "../../../bounded-contexts/activity/app/ports/outbound/provider-name-reader.port";
import type { ServiceNameReaderPort } from "../../../bounded-contexts/activity/app/ports/outbound/service-name-reader.port";
import {
  ProviderCreated,
  ProviderInviteAccepted,
  ProviderInviteSent,
  ProviderStatusDecided,
} from "../../../bounded-contexts/provider/domain/events";
import {
  ServiceCreated,
  ServicePublished,
  ServiceUnpublished,
} from "../../../bounded-contexts/catalog/domain/events";
import { ACTIVITY_TYPES } from "../../../bounded-contexts/activity/domain/activity-type";
import { ReviewCreated } from "../../../bounded-contexts/review/domain/events";
import { UserRegistered } from "../../../bounded-contexts/user/domain/events";
import { registerCatalogActivityHandlers } from "../events/handlers/catalog.event-handlers";
import { registerProviderActivityHandlers } from "../events/handlers/provider.event-handlers";
import { registerReviewActivityHandlers } from "../events/handlers/review.event-handlers";
import { registerUserActivityHandlers } from "../events/handlers/user.event-handlers";

class SpyRecord implements RecordActivityInternalPort {
  calls: RecordActivityInternalInput[] = [];
  async execute(input: RecordActivityInternalInput): Promise<void> {
    this.calls.push(input);
  }
}

// A map rather than a DB, exactly like the notification handler tests: the
// handler only needs `findNameById` to answer truthfully for the ids a test
// seeds, and a miss answered as null rather than a throw — how the real
// adapter answers a provider that no longer exists.
class FakeProviderNames implements ProviderNameReaderPort {
  constructor(private readonly namesById: Record<string, string> = {}) {}
  async findNameById(providerId: string): Promise<string | null> {
    return this.namesById[providerId] ?? null;
  }
}

// Same shape as `FakeProviderNames`, ignoring the locale argument: these
// tests only need one language, so the fake does not need to model the
// multi-translation fallback the real `DrizzleServiceNameReader` does.
class FakeServiceNames implements ServiceNameReaderPort {
  constructor(private readonly namesById: Record<string, string> = {}) {}
  async findNameById(serviceId: string): Promise<string | null> {
    return this.namesById[serviceId] ?? null;
  }
}

let router: EventRouter;
let record: SpyRecord;

beforeEach(() => {
  router = new EventRouter();
  record = new SpyRecord();
  registerUserActivityHandlers(router, { recordActivity: record });
  registerProviderActivityHandlers(router, {
    recordActivity: record,
    providerNameReader: new FakeProviderNames({ p1: "Salão X" }),
  });
  registerCatalogActivityHandlers(router, {
    recordActivity: record,
    serviceNameReader: new FakeServiceNames({ s1: "Corte de cabelo" }),
  });
  registerReviewActivityHandlers(router, { recordActivity: record });
});

describe("user.registered", () => {
  it("records a registration against the person who registered", async () => {
    await router.dispatch([
      new UserRegistered({ userId: "u1", email: "a@b.test", firstName: "Ana" }),
    ]);
    expect(record.calls[0]).toMatchObject({
      actorUserId: "u1",
      type: "user.registered",
      payload: {},
    });
  });

  it("keeps the event's time, not the handler's", async () => {
    // Built by hand rather than via `new UserRegistered(...)`: the domain
    // event's constructor never accepts a custom `occurredOn`, so this is
    // the only way to control it and prove the handler forwards the event's
    // own timestamp instead of stamping `new Date()` itself.
    const event = {
      eventName: "user.registered",
      payload: { userId: "u1", email: "a@b.test", firstName: null },
      occurredOn: new Date("2026-08-26T09:00:00Z"),
    } as unknown as BaseDomainEvent;

    await router.dispatch([event]);

    expect(record.calls[0]!.occurredAt.toISOString()).toBe("2026-08-26T09:00:00.000Z");
  });
});

describe("provider.created", () => {
  it("records against the owner, snapshotting the provider's name", async () => {
    await router.dispatch([
      new ProviderCreated({ providerId: "p1", ownerUserId: "u1", type: "individual" }),
    ]);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u1", type: "provider.created" });
    expect(record.calls[0]!.payload).toEqual({ providerName: "Salão X" });
  });

  it("still records when the name cannot be resolved", async () => {
    await router.dispatch([
      new ProviderCreated({ providerId: "gone", ownerUserId: "u1", type: "individual" }),
    ]);
    expect(record.calls[0]!.payload).toEqual({ providerName: null });
  });
});

describe("provider.status.decided", () => {
  it("records against the decider, with the outcome and the provider's name", async () => {
    await router.dispatch([
      new ProviderStatusDecided({
        providerId: "p1",
        from: "pending",
        to: "active",
        decidedByUserId: "admin1",
      }),
    ]);
    expect(record.calls[0]).toMatchObject({
      actorUserId: "admin1",
      type: "provider.status.decided",
    });
    expect(record.calls[0]!.payload).toEqual({ providerName: "Salão X", to: "active" });
  });
});

describe("provider.invite.sent", () => {
  it("records against the inviter, snapshotting the invited email", async () => {
    await router.dispatch([
      new ProviderInviteSent({
        providerId: "p1",
        inviteId: "inv1",
        email: "colega@ntizo.test",
        role: "staff",
        actorUserId: "u-inviter",
      }),
    ]);
    expect(record.calls[0]).toMatchObject({
      actorUserId: "u-inviter",
      type: "provider.invite.sent",
    });
    expect(record.calls[0]!.payload).toEqual({ email: "colega@ntizo.test" });
  });
});

describe("provider.invite.accepted", () => {
  it("records against the invitee who accepted, snapshotting the workspace's name", async () => {
    await router.dispatch([
      new ProviderInviteAccepted({
        providerId: "p1",
        email: "colega@ntizo.test",
        userId: "u9",
        actorUserId: "u9",
      }),
    ]);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u9", type: "provider.invite.accepted" });
    expect(record.calls[0]!.payload).toEqual({ providerName: "Salão X" });
  });
});

describe("service.created", () => {
  it("records against the actor, snapshotting the service's id and name", async () => {
    await router.dispatch([
      new ServiceCreated({ serviceId: "s1", providerId: "p1", actorUserId: "u2" }),
    ]);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u2", type: "service.created" });
    expect(record.calls[0]!.payload).toEqual({ serviceId: "s1", serviceName: "Corte de cabelo" });
  });
});

describe("service.published", () => {
  it("snapshots the service's name rather than only its id", async () => {
    // The row says "You published X". Storing only the id would render the
    // id, and resolving on read would rewrite history when the service is
    // renamed.
    await router.dispatch([new ServicePublished({ serviceId: "s1", actorUserId: "u2" })]);
    expect(record.calls[0]!.payload).toEqual({ serviceId: "s1", serviceName: "Corte de cabelo" });
  });

  it("still records when the name cannot be resolved", async () => {
    // A deleted service must not silence the entry. "You published
    // something" is worth more than nothing at all.
    await router.dispatch([new ServicePublished({ serviceId: "gone", actorUserId: "u2" })]);
    expect(record.calls).toHaveLength(1);
    expect(record.calls[0]!.payload).toEqual({ serviceId: "gone", serviceName: null });
  });
});

describe("service.unpublished", () => {
  it("records against the actor, snapshotting the service's id and name", async () => {
    await router.dispatch([new ServiceUnpublished({ serviceId: "s1", actorUserId: "u2" })]);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u2", type: "service.unpublished" });
    expect(record.calls[0]!.payload).toEqual({ serviceId: "s1", serviceName: "Corte de cabelo" });
  });
});

describe("review.created", () => {
  it("records against the reviewer, with no lookup needed", async () => {
    await router.dispatch([
      new ReviewCreated({
        reviewId: "r1",
        providerId: "p1",
        providerName: "Salão X",
        rating: 5,
        actorUserId: "u3",
      }),
    ]);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u3", type: "review.created" });
    expect(record.calls[0]!.payload).toEqual({ providerName: "Salão X", rating: 5 });
  });
});


describe("ACTIVITY_TYPES alignment", () => {
  it("registers exactly one handler under each activity type's own name", () => {
    // Event names and activity types are one vocabulary, not two that
    // happen to agree — fix round 1 removed a bridge that translated three
    // of the nine (Task 2 had let them drift into camelCase, which read as
    // "type == event name" often enough to be believed and rarely enough
    // wrong to bite whoever added the tenth type). This iterates the closed
    // list itself, against the same router the tests above dispatch
    // through, so a future type added to ACTIVITY_TYPES without a matching
    // `router.on(...)` call — or a handler renamed on one side and not the
    // other — reds here instead of only in a comment claiming they agree.
    for (const type of ACTIVITY_TYPES) {
      expect(router.handlerCount(type)).toBe(1);
    }
  });
});
