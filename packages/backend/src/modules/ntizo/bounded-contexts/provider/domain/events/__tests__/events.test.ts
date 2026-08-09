import { describe, expect, it } from "bun:test";
import {
  ProviderCreated,
  ProviderDeactivated,
  ProviderInviteAccepted,
  ProviderInviteRevoked,
  ProviderInviteSent,
  ProviderMemberAdded,
  ProviderMemberRemoved,
  ProviderMemberRoleUpdated,
  ProviderUpdated,
} from "..";

describe("provider domain events", () => {
  it("carries the provider's own id as aggregateId, not the payload", () => {
    // Every one of these is raised by the Provider aggregate, so aggregateId
    // must be the provider's id specifically — not empty, and not the
    // payload object itself (a naive `super(name, payload, payload)` typo
    // would otherwise pass a TypeScript check since both are objects... but
    // aggregateId is typed `string`, so this also guards the runtime shape).
    const events = [
      new ProviderCreated({
        providerId: "p1",
        ownerUserId: "u1",
        type: "individual",
      }),
      new ProviderUpdated({ providerId: "p2" }),
      new ProviderDeactivated({ providerId: "p3" }),
      new ProviderMemberAdded({
        providerId: "p4",
        userId: "u1",
        role: "staff",
      }),
      new ProviderMemberRemoved({ providerId: "p5", userId: "u1" }),
      new ProviderMemberRoleUpdated({
        providerId: "p6",
        userId: "u1",
        role: "admin",
      }),
      new ProviderInviteSent({
        providerId: "p7",
        email: "a@b.com",
        token: "tok",
        role: "staff",
      }),
      new ProviderInviteAccepted({
        providerId: "p8",
        email: "a@b.com",
        userId: "u1",
      }),
      new ProviderInviteRevoked({ providerId: "p9", inviteId: "i1" }),
    ] as const;

    for (const event of events) {
      expect(typeof event.aggregateId).toBe("string");
      expect(event.aggregateId.length).toBeGreaterThan(0);
      expect(event.aggregateId).toBe(event.payload.providerId);
      expect(event.aggregateId).not.toBe(event.payload as unknown);
    }

    expect(events.map((e) => e.aggregateId)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
    ]);
  });

  it("gives two instances of the same event distinct eventIds", () => {
    const first = new ProviderUpdated({ providerId: "p1" });
    const second = new ProviderUpdated({ providerId: "p1" });

    expect(first.eventId).not.toBe(second.eventId);
  });

  it("pins the event name strings — they become the outbox's event_type", () => {
    // PUBLIC CONTRACT: renaming any of these silently orphans consumers
    // written against the string. See events/index.ts's file-level comment.
    const names = {
      ProviderCreated: new ProviderCreated({
        providerId: "p1",
        ownerUserId: "u1",
        type: "individual",
      }).eventName,
      ProviderUpdated: new ProviderUpdated({ providerId: "p1" }).eventName,
      ProviderDeactivated: new ProviderDeactivated({ providerId: "p1" })
        .eventName,
      ProviderMemberAdded: new ProviderMemberAdded({
        providerId: "p1",
        userId: "u1",
        role: "staff",
      }).eventName,
      ProviderMemberRemoved: new ProviderMemberRemoved({
        providerId: "p1",
        userId: "u1",
      }).eventName,
      ProviderMemberRoleUpdated: new ProviderMemberRoleUpdated({
        providerId: "p1",
        userId: "u1",
        role: "admin",
      }).eventName,
      ProviderInviteSent: new ProviderInviteSent({
        providerId: "p1",
        email: "a@b.com",
        token: "tok",
        role: "staff",
      }).eventName,
      ProviderInviteAccepted: new ProviderInviteAccepted({
        providerId: "p1",
        email: "a@b.com",
        userId: "u1",
      }).eventName,
      ProviderInviteRevoked: new ProviderInviteRevoked({
        providerId: "p1",
        inviteId: "i1",
      }).eventName,
    };

    expect(names).toEqual({
      ProviderCreated: "provider.created",
      ProviderUpdated: "provider.updated",
      ProviderDeactivated: "provider.deactivated",
      ProviderMemberAdded: "provider.member.added",
      ProviderMemberRemoved: "provider.member.removed",
      ProviderMemberRoleUpdated: "provider.member.role-updated",
      ProviderInviteSent: "provider.invite.sent",
      ProviderInviteAccepted: "provider.invite.accepted",
      ProviderInviteRevoked: "provider.invite.revoked",
    });
  });
});
