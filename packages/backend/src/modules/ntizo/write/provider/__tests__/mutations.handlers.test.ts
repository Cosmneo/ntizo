import { describe, expect, it } from "bun:test";
import { toExecutionContext } from "../graphql/handlers/arg-mappers";

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
