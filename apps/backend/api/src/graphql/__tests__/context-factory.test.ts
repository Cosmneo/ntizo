import { describe, expect, it, mock } from "bun:test";
import type { UserRole } from "@ntizo/shared";

/**
 * The property under test is which COLUMN the role comes from, so
 * better-auth's session is mocked to report a role that deliberately
 * disagrees with the ntizo one. Before this factory existed the context took
 * the session's value; taking it again would silently reinstate the split
 * brain, where authorization enforces one role and `userMe` displays another.
 */
function withSession(sessionUser: unknown) {
  mock.module("@ntizo/backend/modules/better-auth", () => ({
    getAuth: () => ({ api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) } }),
  }));
}

async function subject(deps: { findPlatformRole: (id: string) => Promise<UserRole | null> }) {
  const { createGraphqlContextFactory } = await import("../context-factory");
  return createGraphqlContextFactory({ userRead: { findPlatformRole: deps.findPlatformRole } });
}

describe("createGraphqlContextFactory", () => {
  it("takes the role from ntizo_user, not from the better-auth session", async () => {
    withSession({ id: "u1", email: "a@b.c", role: "customer" });
    const ctx = await (await subject({ findPlatformRole: async () => "admin" }))(new Request("https://x/"));
    expect(ctx.role).toBe("admin");
    expect(ctx.requesterUserId).toBe("u1");
  });

  it("falls back to the least-privileged role when the ntizo row is missing", async () => {
    withSession({ id: "u1", email: "a@b.c", role: "admin" });
    const ctx = await (await subject({ findPlatformRole: async () => null }))(new Request("https://x/"));
    expect(ctx.role).toBe("customer");
  });

  it("never queries for an anonymous caller", async () => {
    withSession(null);
    let queried = false;
    const ctx = await (await subject({
      findPlatformRole: async () => { queried = true; return "admin"; },
    }))(new Request("https://x/"));
    expect(ctx.role).toBe("customer");
    expect(ctx.requesterUserId).toBeNull();
    expect(queried).toBe(false);
  });
});
