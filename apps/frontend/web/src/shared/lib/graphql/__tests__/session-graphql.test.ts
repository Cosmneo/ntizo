import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphqlError, sessionGraphql } from "../session-graphql";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("sessionGraphql", () => {
  it("returns data on success", async () => {
    mockFetch(200, { data: { providerMine: [{ id: "p1" }] } });
    const out = await sessionGraphql<{ providerMine: Array<{ id: string }> }>("{ providerMine { id } }");
    expect(out.providerMine[0]!.id).toBe("p1");
  });

  it("throws on a GraphQL error delivered with HTTP 200", async () => {
    // This is the important case: the transport succeeds, the operation did not.
    mockFetch(200, {
      data: null,
      errors: [{
        message: "nope",
        // The real wire shape: coarse `code` plus fine-grained `originalCode`.
        extensions: { code: "FORBIDDEN", originalCode: "NOT_PROVIDER_OWNER" },
      }],
    });
    await expect(sessionGraphql("{ x }")).rejects.toBeInstanceOf(GraphqlError);
    // `code` must prefer originalCode — branching on the coarse FORBIDDEN
    // would make every authorization failure indistinguishable.
    await expect(sessionGraphql("{ x }")).rejects.toMatchObject({
      code: "NOT_PROVIDER_OWNER",
      kitCode: "FORBIDDEN",
      status: 200,
    });
  });

  it("throws on a non-2xx even when no errors array is present", async () => {
    mockFetch(500, {});
    await expect(sessionGraphql("{ x }")).rejects.toBeInstanceOf(GraphqlError);
  });

  it("sends credentials so the better-auth cookie is attached", async () => {
    const fn = mockFetch(200, { data: {} });
    await sessionGraphql("{ x }");
    expect(fn.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
  });
});
