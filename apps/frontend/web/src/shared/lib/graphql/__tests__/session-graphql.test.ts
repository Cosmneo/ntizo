import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphqlError, sessionGraphql } from "../session-graphql";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** For simulating a non-JSON body (proxy error page, truncated response, …). */
function mockFetchRawText(status: number, rawText: string) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => rawText,
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

  it("falls back to the coarse kit code when the backend supplies no originalCode", async () => {
    mockFetch(200, {
      data: null,
      errors: [{
        message: "nope",
        extensions: { code: "NOT_FOUND" },
      }],
    });
    await expect(sessionGraphql("{ x }")).rejects.toMatchObject({
      code: "NOT_FOUND",
      kitCode: "NOT_FOUND",
    });
  });

  it("surfaces a GraphqlError instead of a raw SyntaxError when the body isn't JSON", async () => {
    // A proxy error page or truncated response is not valid JSON. Callers
    // that branch on `instanceof GraphqlError` must never see a raw
    // SyntaxError escape from a naive `response.json()` call.
    mockFetchRawText(502, "<html><body>Bad Gateway</body></html>".repeat(10));
    const failure = sessionGraphql("{ x }");
    await expect(failure).rejects.toBeInstanceOf(GraphqlError);
    await expect(failure).rejects.toMatchObject({ status: 502 });

    let err: GraphqlError | undefined;
    try {
      await failure;
    } catch (e) {
      err = e as GraphqlError;
    }
    expect(err?.message).toContain("502");
    // The HTML page must be truncated, not dumped whole into the message.
    expect(err?.message.length).toBeLessThan(300);
  });

  it("sends credentials, the CSRF header, and a JSON body with the query and variables", async () => {
    const fn = mockFetch(200, { data: {} });
    await sessionGraphql("{ x }", { foo: "bar" });
    const init = fn.mock.calls[0]![1] as RequestInit;
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    // The server 403s any request missing this header entirely — its exact
    // presence, not just the overall shape, is what production traffic
    // depends on.
    expect(init.headers).toMatchObject({
      "x-graphql-csrf": "1",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      query: "{ x }",
      variables: { foo: "bar" },
    });
  });
});
