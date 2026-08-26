import { describe, expect, it } from "bun:test";
import type { AddressDTO, CurrentUserDTO, UserRole } from "@ntizo/shared";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { mapGetCurrentUserInput } from "../graphql/handlers/arg-mappers";
import { createUserReadHandlers } from "../graphql/handlers/queries.handlers";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import type { UserReadRepositoryPort } from "../app/ports/outbound/user-read.repository.port";
import type { GetCurrentUserProjectionInput } from "../app/ports/inbound";

const dto: CurrentUserDTO = {
  id: "u1", email: "a@b.c", role: "customer", status: "active",
  createdAt: "2026-01-01T00:00:00.000Z", name: "A B",
  firstName: "A", lastName: "B", displayName: "A B",
  avatarUrl: null, avatarKey: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "UTC",
  dateOfBirth: null, gender: null,
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
  constructor(
    private readonly toReturn: CurrentUserDTO | null,
    private readonly roleToReturn: UserRole | null = "customer",
  ) {}
  async findCurrentUser(userId: string): Promise<CurrentUserDTO | null> {
    this.calls.push(`findCurrentUser:${userId}`);
    return this.toReturn;
  }
  async findPlatformRole(userId: string): Promise<UserRole | null> {
    this.calls.push(`findPlatformRole:${userId}`);
    return this.roleToReturn;
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

/**
 * The unit above only covers `mapGetCurrentUserInput` in isolation. The
 * boundary the client actually talks to is the `argsMapper` lambda wired up
 * inside `createUserReadHandlers` — a regression could leave that lambda
 * reading from `args` (e.g. `args.input.userId ?? requireRequesterUserId(ctx)`)
 * while `mapGetCurrentUserInput` itself stays untouched and fully green. So
 * this exercises the real built handler, not the mapper function directly.
 */
describe("createUserReadHandlers", () => {
  it("builds a handler for the read field", () => {
    const handlers = createUserReadHandlers({
      getCurrentUser: new GetCurrentUserProjection(new FakeUserReadRepository(dto)),
      listUsersForAdmin: { execute: async () => [] } as never,
      listMyAddresses: { execute: async (): Promise<AddressDTO[]> => [] },
    });
    // Three now: the profile, the address list and the admin user list.
    // Asserting the count rather than just "not empty" is what catches a
    // field silently dropped from the schema.
    expect(handlers.length).toBe(3);
  });

  it("stamps requestedByUserId from the session, even when args try to smuggle a different id", async () => {
    const calls: GetCurrentUserProjectionInput[] = [];
    const spy = {
      execute: async (input: GetCurrentUserProjectionInput) => {
        calls.push(input);
        return dto;
      },
    };
    const handlers = createUserReadHandlers({
      getCurrentUser: spy,
      listUsersForAdmin: { async execute() { return []; } } as never,
    listMyAddresses: { execute: async (): Promise<AddressDTO[]> => [] },
    });

    // A hostile/buggy client's args, carrying an attacker-supplied id under
    // an unrelated field name. This is the value of the GraphQL `input`
    // argument itself — the kit's `handler(args, ctx)` takes that value
    // directly, not wrapped in another `{ input: ... }` envelope. The use
    // case must only ever see the session-stamped id, never anything read
    // off args.
    const hostileArgs = { userId: "victim" };
    const authenticatedCtx = ctx();

    await handlers[0]!.handler(hostileArgs, authenticatedCtx);

    expect(calls).toEqual([{ requestedByUserId: "u-session" }]);
  });
});
