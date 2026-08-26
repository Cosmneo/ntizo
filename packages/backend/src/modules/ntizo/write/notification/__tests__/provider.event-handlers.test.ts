import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInput } from "../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";
import type { ProviderNameReaderPort } from "../../../bounded-contexts/notification/app/ports/outbound/provider-name-reader.port";
import type { UserByEmailReaderPort } from "../../../bounded-contexts/notification/app/ports/outbound/user-by-email-reader.port";
import {
  ProviderCreated,
  ProviderInviteSent,
  ProviderStatusDecided,
} from "../../../bounded-contexts/provider/domain/events";
import { registerProviderNotificationHandlers } from "../events/handlers/provider.event-handlers";

class SpyRaise {
  calls: RaiseNotificationInput[] = [];
  async execute(input: RaiseNotificationInput) {
    this.calls.push(input);
    return { notificationId: `n${this.calls.length}` };
  }
}

// A map rather than a DB: the handler only needs `findUserIdByEmail` to
// answer truthfully for the emails a test seeds, exactly like the real
// adapter answers truthfully for the rows that exist.
class StubUserByEmailReader implements UserByEmailReaderPort {
  constructor(private readonly usersByEmail: Record<string, string> = {}) {}
  async findUserIdByEmail(email: string): Promise<string | null> {
    return this.usersByEmail[email] ?? null;
  }
}

// Same shape, for the other cross-BC lookup this handler file owns: a map of
// provider id to name, with a miss answered as null rather than a throw —
// exactly how `DrizzleProviderNameReader` answers a provider that no longer
// exists.
class StubProviderNameReader implements ProviderNameReaderPort {
  constructor(private readonly namesById: Record<string, string> = {}) {}
  async findNameById(providerId: string): Promise<string | null> {
    return this.namesById[providerId] ?? null;
  }
}

let router: EventRouter;
let raise: SpyRaise;
let userByEmailReader: StubUserByEmailReader;
let providerNameReader: StubProviderNameReader;

beforeEach(() => {
  router = new EventRouter();
  raise = new SpyRaise();
  userByEmailReader = new StubUserByEmailReader({ "colega@ntizo.test": "u9" });
  providerNameReader = new StubProviderNameReader({ p1: "Salão X" });
  registerProviderNotificationHandlers(router, {
    raiseNotification: raise as never,
    userByEmailReader,
    providerNameReader,
  });
});

describe("provider.created", () => {
  it("welcomes the workspace, not the person who made it", async () => {
    await router.dispatch([
      new ProviderCreated({ providerId: "p1", ownerUserId: "u1", type: "organization" }),
    ]);

    expect(raise.calls).toHaveLength(1);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.ProviderWorkspaceWelcome,
      audience: "provider",
      providerId: "p1",
    });
  });

  it("snapshots the provider type, since ProviderCreated carries no name to snapshot", async () => {
    await router.dispatch([
      new ProviderCreated({ providerId: "p1", ownerUserId: "u1", type: "organization" }),
    ]);
    expect(raise.calls[0]!.payload).toEqual({ type: "organization" });
  });
});

describe("provider.status.decided", () => {
  it("raises ProviderVerified when the decision is active", async () => {
    await router.dispatch([
      new ProviderStatusDecided({
        providerId: "p1",
        from: "pending",
        to: "active",
        decidedByUserId: "admin1",
      }),
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
    });
  });

  it("raises ProviderDocumentsRequired when the decision is rejected", async () => {
    await router.dispatch([
      new ProviderStatusDecided({
        providerId: "p1",
        from: "pending",
        to: "rejected",
        decidedByUserId: "admin1",
      }),
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.ProviderDocumentsRequired,
      audience: "provider",
      providerId: "p1",
    });
  });

  it("says nothing about a decision that is neither", async () => {
    // A provider moved back to `pending` has not been told anything worth an
    // inbox row, and inventing one would be the platform narrating its own
    // bookkeeping at somebody who is waiting.
    await router.dispatch([
      new ProviderStatusDecided({
        providerId: "p1",
        from: "active",
        to: "pending",
        decidedByUserId: "admin1",
      }),
    ]);
    expect(raise.calls).toHaveLength(0);
  });
});

describe("provider.invite.sent", () => {
  it("addresses the invitee personally when they already have an account", async () => {
    await router.dispatch([
      new ProviderInviteSent({
        providerId: "p1",
        inviteId: "inv1",
        email: "colega@ntizo.test",
        role: "staff",
        actorUserId: "u-inviter",
      }),
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: "u9",
    });
  });

  it("snapshots the workspace's name, because a personal inbox cannot assume the reader knows which one", async () => {
    await router.dispatch([
      new ProviderInviteSent({
        providerId: "p1",
        inviteId: "inv1",
        email: "colega@ntizo.test",
        role: "staff",
        actorUserId: "u-inviter",
      }),
    ]);
    expect(raise.calls[0]!.payload).toEqual({
      providerId: "p1",
      providerName: "Salão X",
      role: "staff",
    });
  });

  it("still delivers the invitation, nameless, when the workspace cannot be resolved", async () => {
    // A miss here is not the same case as the invitee-has-no-account miss
    // below: the invitee is real, so the row is still worth raising — it
    // just cannot say which workspace it is about.
    await router.dispatch([
      new ProviderInviteSent({
        providerId: "p-gone",
        inviteId: "inv3",
        email: "colega@ntizo.test",
        role: "staff",
        actorUserId: "u-inviter",
      }),
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: "u9",
    });
    expect(raise.calls[0]!.payload).toEqual({
      providerId: "p-gone",
      providerName: null,
      role: "staff",
    });
  });

  it("raises nothing when the invitee has no account", async () => {
    // There is no inbox to address. They get an email, which is Phase 2's job,
    // and an inbox row keyed to nobody is not a substitute for one.
    await router.dispatch([
      new ProviderInviteSent({
        providerId: "p1",
        inviteId: "inv2",
        email: "stranger@ntizo.test",
        role: "staff",
        actorUserId: "u-inviter",
      }),
    ]);
    expect(raise.calls).toHaveLength(0);
  });
});
