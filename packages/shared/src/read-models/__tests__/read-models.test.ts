import { describe, expect, it } from "vitest";
import {
  providerListItemReadModel,
  providerDetailReadModel,
} from "../system/provider";
import { currentUserReadModel } from "../system/user";
import { availabilityConfigReadModel } from "../system/availability";

describe("providerListItemReadModel", () => {
  it("accepts a well-formed list item", () => {
    const parsed = providerListItemReadModel.parse({
      id: "952c41ea-299a-4e1f-a05f-a68f52a112af",
      name: "Playwright's Org",
      slug: "playwright-s-org",
      type: "organization",
      status: "active",
      role: "owner",
    });
    expect(parsed.role).toBe("owner");
  });

  it("rejects an unknown provider type", () => {
    expect(() =>
      providerListItemReadModel.parse({
        id: "x", name: "n", slug: "s", type: "sole_trader",
        status: "active", role: "owner",
      }),
    ).toThrow();
  });
});

describe("providerDetailReadModel", () => {
  it("accepts members and invites", () => {
    const parsed = providerDetailReadModel.parse({
      id: "p1", name: "Org", slug: "org", type: "organization",
      status: "active", description: null, address: null,
logo: null, photos: [], documents: [], reverificationRequestedAt: null, ownerUserId: "u1",
      members: [{ userId: "u1", email: "a@b.c", name: "A B", role: "owner", joinedAt: "2026-08-07T00:00:00.000Z" }],
      invites: [{ id: "i1", email: "c@d.e", role: "staff", status: "pending" }],
    });
    expect(parsed.members).toHaveLength(1);
    expect(parsed.invites[0]!.status).toBe("pending");
  });
});

describe("currentUserReadModel", () => {
  it("accepts a profile with nullable fields unset", () => {
    const parsed = currentUserReadModel.parse({
      id: "u1", email: "a@b.c", role: "customer", status: "active",
      createdAt: "2026-08-07T00:00:00.000Z", name: "A B",
      firstName: "A", lastName: "B", displayName: "A B",
      avatarUrl: null, phoneNumber: null, bio: null,
      language: "en-US", timezone: "UTC",
      dateOfBirth: null, gender: null,
    });
    expect(parsed.avatarUrl).toBeNull();
    // Two optional personal details a user may never fill in. Null here is
    // "never answered"; "undisclosed" is an answer, and is not this.
    expect(parsed.dateOfBirth).toBeNull();
    expect(parsed.gender).toBeNull();
  });
});

describe("availabilityConfigReadModel", () => {
  const fullConfig = {
    providerId: "p1",
    timezone: "Africa/Maputo",
    members: [
      {
        memberId: "m1",
        userId: "u1",
        name: "A B",
        role: "owner",
        weekly: [
          {
            id: "w1",
            weekday: 1,
            startMinute: 480,
            endMinute: 1020,
            bufferMinutes: 10,
            slotIntervalMinutes: 30,
            capacity: 2,
          },
        ],
        exceptions: [
          {
            id: "e1",
            onDate: "2026-08-20",
            kind: "closed",
            startMinute: null,
            endMinute: null,
            note: "Public holiday",
          },
        ],
      },
    ],
    closures: [{ id: "c1", fromDate: "2026-12-24", toDate: "2026-12-26", note: "Christmas" }],
  };

  it("accepts a full configuration", () => {
    expect(() => availabilityConfigReadModel.parse(fullConfig)).not.toThrow();
  });

  it("rejects an unknown exception kind", () => {
    expect(() =>
      availabilityConfigReadModel.parse({
        ...fullConfig,
        members: [{ ...fullConfig.members[0], exceptions: [{ ...fullConfig.members[0]!.exceptions[0], kind: "maybe" }] }],
      }),
    ).toThrow();
  });

  it("accepts a member with an empty week", () => {
    expect(() =>
      availabilityConfigReadModel.parse({
        ...fullConfig,
        members: [{ ...fullConfig.members[0], weekly: [] }],
      }),
    ).not.toThrow();
  });

  // `null` on a weekly rule's own shape means "use the default", the same as
  // it does on the write side's `weeklyRuleInput` — this read model has to
  // accept it explicitly, not just accept the field being present at all.
  it("accepts a rule whose own shape is null, meaning it follows the default", () => {
    expect(() =>
      availabilityConfigReadModel.parse({
        ...fullConfig,
        members: [
          {
            ...fullConfig.members[0],
            weekly: [
              {
                id: "w1",
                weekday: 1,
                startMinute: 480,
                endMinute: 1020,
                bufferMinutes: null,
                slotIntervalMinutes: null,
                capacity: null,
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  // Required, not optional — every producer of this read model must say
  // explicitly whether a rule follows the default or not, so a rule can
  // never round-trip through this schema and quietly lose its own shape.
  it("refuses a rule missing its own shape fields entirely", () => {
    expect(() =>
      availabilityConfigReadModel.parse({
        ...fullConfig,
        members: [
          {
            ...fullConfig.members[0],
            weekly: [{ id: "w1", weekday: 1, startMinute: 480, endMinute: 1020 }],
          },
        ],
      }),
    ).toThrow();
  });
});
