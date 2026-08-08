import { describe, expect, it } from "bun:test";
import type { CurrentUserDTO } from "@ntizo/shared";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { mapGetCurrentUserInput } from "../graphql/handlers/arg-mappers";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import type { UserReadRepositoryPort } from "../app/ports/outbound/user-read.repository.port";

const dto: CurrentUserDTO = {
  id: "u1", email: "a@b.c", role: "customer", status: "active",
  createdAt: "2026-01-01T00:00:00.000Z", name: "A B",
  firstName: "A", lastName: "B", displayName: "A B",
  avatarUrl: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "UTC",
};

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null,
    lastName: null, role: "customer",
    requestId: null, ipAddress: null, userAgent: null,
    ...overrides,
  };
}

class FakeUserReadRepository implements UserReadRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly toReturn: CurrentUserDTO | null) {}
  async findCurrentUser(userId: string): Promise<CurrentUserDTO | null> {
    this.calls.push(`findCurrentUser:${userId}`);
    return this.toReturn;
  }
}

describe("mapGetCurrentUserInput", () => {
  it("takes the requester id from the session", () => {
    expect(mapGetCurrentUserInput(ctx())).toEqual({ requestedByUserId: "u-session" });
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() => mapGetCurrentUserInput(ctx({ requesterUserId: null }))).toThrow();
  });
});

describe("GetCurrentUserProjection", () => {
  it("returns the current user for the requester", async () => {
    const repo = new FakeUserReadRepository(dto);
    const result = await new GetCurrentUserProjection(repo).execute({
      requestedByUserId: "u1",
    });
    expect(result).toEqual(dto);
    expect(repo.calls).toEqual(["findCurrentUser:u1"]);
  });

  it("throws when the requester has no user row", async () => {
    const repo = new FakeUserReadRepository(null);
    await expect(
      new GetCurrentUserProjection(repo).execute({ requestedByUserId: "ghost" }),
    ).rejects.toThrow("[read/user] current user not found");
  });
});
