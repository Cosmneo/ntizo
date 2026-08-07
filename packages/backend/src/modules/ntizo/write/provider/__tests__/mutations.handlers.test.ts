import { describe, expect, it } from "bun:test";
import { toExecutionContext } from "../graphql/handlers/arg-mappers";
import {
  mapProviderInviteAcceptOutput,
  mapProviderInviteSendOutput,
} from "../graphql/handlers/mutations.handlers";

describe("toExecutionContext", () => {
  it("builds an authenticated ExecutionContext from the graphql context", () => {
    const ec = toExecutionContext({
      requesterUserId: "u1", email: "a@b.c", firstName: "A", lastName: "B",
      requestId: "r1", ipAddress: "1.2.3.4", userAgent: "ua",
    });
    expect(ec.requester.type).toBe("authenticated");
    if (ec.requester.type !== "authenticated") throw new Error("unreachable");
    expect(ec.requester.user.userId).toBe("u1");
    expect(ec.metadata.requestId).toBe("r1");
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() =>
      toExecutionContext({
        requesterUserId: null, email: null, firstName: null, lastName: null,
        requestId: null, ipAddress: null, userAgent: null,
      }),
    ).toThrow();
  });
});

describe("mapProviderInviteSendOutput", () => {
  it("returns exactly { inviteId } — the invite token is never projected through", () => {
    const projected = mapProviderInviteSendOutput({
      inviteId: "inv-1",
      token: "super-secret-invite-token",
    });

    // `toEqual` already fails on an extra key (verified: bun:test's toEqual
    // is a strict deep-equal, not a partial/subset match), so this alone
    // would catch a future refactor that reinstates pass-through (e.g.
    // `return result;`). The explicit key-set and `in` checks below assert
    // the absence directly, so the failure reason is unambiguous rather than
    // relying on toEqual's mismatch diff.
    expect(projected).toEqual({ inviteId: "inv-1" });
    expect(Object.keys(projected).sort()).toEqual(["inviteId"]);
    expect("token" in projected).toBe(false);
  });
});

describe("mapProviderInviteAcceptOutput", () => {
  it("returns exactly { providerId } — the accepting member's id is never projected through", () => {
    const projected = mapProviderInviteAcceptOutput({
      providerId: "prov-1",
      memberId: "mem-1",
    });

    expect(projected).toEqual({ providerId: "prov-1" });
    expect(Object.keys(projected).sort()).toEqual(["providerId"]);
    expect("memberId" in projected).toBe(false);
  });
});
