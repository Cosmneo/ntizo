import { describe, expect, it } from "vitest";
import {
  providerListItemReadModel,
  providerDetailReadModel,
} from "../system/provider";
import { currentUserReadModel } from "../system/user";

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
      status: "active", description: null, address: null, ownerUserId: "u1",
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
