import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import {
  IndividualProviderCannotHaveMembersError,
  InsufficientProviderPermissionsError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  NotProviderOwnerError,
  ProviderNotFoundError,
} from "..";

describe("provider domain exceptions", () => {
  it("are not masked to INTERNAL_ERROR by the kit", () => {
    const errors: Error[] = [
      new ProviderNotFoundError("p1"),
      new NotProviderOwnerError("p1", "u1"),
      new InsufficientProviderPermissionsError("p1", "u1"),
      new InviteExpiredError("t"),
      new InviteAlreadyUsedError("t"),
      new InviteNotFoundError("t"),
      new MemberAlreadyExistsError("p1", "u1"),
      new MemberNotFoundError("p1", "u1"),
      new IndividualProviderCannotHaveMembersError("p1"),
    ];
    const masked = errors.filter((e) => getGraphQLErrorCode(e) === "INTERNAL_ERROR");
    expect(masked.map((e) => e.name)).toEqual([]);
  });

  it("carries a stable, distinct code per failure mode", () => {
    expect(new ProviderNotFoundError("p1").code).toBe("PROVIDER_NOT_FOUND");
    expect(new NotProviderOwnerError("p1", "u1").code).toBe("NOT_PROVIDER_OWNER");
    expect(new InviteExpiredError("t").code).toBe("INVITE_EXPIRED");
    expect(new MemberAlreadyExistsError("p1", "u1").code).toBe("MEMBER_ALREADY_EXISTS");
  });

  it("still reads as an Error with a useful message", () => {
    const e = new ProviderNotFoundError("p1");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain("p1");
  });
});
