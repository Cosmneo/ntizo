import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import { requireRequesterUserId, type NtizoGraphqlContext } from "../context";

const anonymousCtx: NtizoGraphqlContext = {
  requesterUserId: null,
  email: null,
  firstName: null,
  lastName: null,
  role: "customer",
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

describe("requireRequesterUserId", () => {
  it("returns the requester id when the request is authenticated", () => {
    const ctx: NtizoGraphqlContext = { ...anonymousCtx, requesterUserId: "u1" };
    expect(requireRequesterUserId(ctx)).toBe("u1");
  });

  it("throws an error the GraphQL layer classifies as UNAUTHENTICATED, not INTERNAL_ERROR", () => {
    // This is the whole point of the fix in context.ts: a bare `Error`
    // (the previous implementation) falls through every `instanceof` check
    // in the kit's `getGraphQLErrorCode` / `mapErrorToGraphQLError` and gets
    // masked to INTERNAL_ERROR, making an anonymous request wire-identical
    // to a genuine server failure. Frontend code (`userQueries.me()` in
    // apps/frontend/web/src/features/user/data/user.repository.ts) needs to
    // tell the two apart, which is only possible if this throws something
    // the kit recognises as an authentication failure.
    let caught: unknown;
    try {
      requireRequesterUserId(anonymousCtx);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(getGraphQLErrorCode(caught)).toBe("UNAUTHENTICATED");
    expect(getGraphQLErrorCode(caught)).not.toBe("INTERNAL_ERROR");
  });
});
