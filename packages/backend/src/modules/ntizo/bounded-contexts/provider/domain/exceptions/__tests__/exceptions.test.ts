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
    // Every code below is a PUBLIC CONTRACT the web client branches on
    // (see domain/exceptions/index.ts's file-level comment and
    // features/provider/domain/errors.ts on the frontend). Pin all 9 in one
    // toEqual so a rename anywhere here fails this test instead of only
    // surfacing as a silently-generic error message in the UI.
    const codes = {
      ProviderNotFoundError: new ProviderNotFoundError("p1").code,
      NotProviderOwnerError: new NotProviderOwnerError("p1", "u1").code,
      InsufficientProviderPermissionsError: new InsufficientProviderPermissionsError(
        "p1",
        "u1",
      ).code,
      InviteExpiredError: new InviteExpiredError("t").code,
      InviteAlreadyUsedError: new InviteAlreadyUsedError("t").code,
      InviteNotFoundError: new InviteNotFoundError("t").code,
      MemberAlreadyExistsError: new MemberAlreadyExistsError("p1", "u1").code,
      MemberNotFoundError: new MemberNotFoundError("p1", "u1").code,
      IndividualProviderCannotHaveMembersError:
        new IndividualProviderCannotHaveMembersError("p1").code,
    };
    expect(codes).toEqual({
      ProviderNotFoundError: "PROVIDER_NOT_FOUND",
      NotProviderOwnerError: "NOT_PROVIDER_OWNER",
      InsufficientProviderPermissionsError: "INSUFFICIENT_PROVIDER_PERMISSIONS",
      InviteExpiredError: "INVITE_EXPIRED",
      InviteAlreadyUsedError: "INVITE_ALREADY_USED",
      InviteNotFoundError: "INVITE_NOT_FOUND",
      MemberAlreadyExistsError: "MEMBER_ALREADY_EXISTS",
      MemberNotFoundError: "MEMBER_NOT_FOUND",
      IndividualProviderCannotHaveMembersError: "INDIVIDUAL_PROVIDER_CANNOT_HAVE_MEMBERS",
    });
  });

  it("still reads as an Error with a useful message", () => {
    const e = new ProviderNotFoundError("p1");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain("p1");
  });
});
