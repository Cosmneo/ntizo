import { describe, expect, it } from "bun:test";
import { getTrustedOrigins } from "@ntizo/backend/shared/infra/config";
import { isOriginTrusted } from "../../middlewares/cors";
import { graphqlCorsFetch } from "../cors";

/**
 * Regression coverage for the /graphql CORS fix: Yoga's bundled default CORS
 * plugin reflects any Origin with credentials, and its own Response object
 * can't be corrected by a wrapping Hono middleware after the fact (see
 * cors.ts's top comment). graphqlCorsFetch is what actually enforces the
 * trusted-origin allowlist on the outgoing response, so these tests exercise
 * it (and the pure `isOriginTrusted` check it's built on) directly, at unit
 * speed — no server, no Yoga instance, no network.
 */

const STAGE = "local" as const;
const TRUSTED_ORIGIN = getTrustedOrigins(STAGE)[0]!; // "http://localhost:8788"
const UNTRUSTED_ORIGIN = "https://evil.example.com";

/** A GraphQL response with no CORS headers of its own. */
function stubGraphqlResponse(): Response {
  return new Response(JSON.stringify({ data: { __typename: "Query" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Simulates what Yoga's real fetch() returns today: its bundled useCORS
 * plugin already reflects whatever Origin the request carried, with
 * credentials allowed, before graphqlCorsFetch gets a chance to act. Using
 * this (rather than a "clean" stub) is what makes the untrusted-origin
 * tests meaningful — they prove graphqlCorsFetch actively strips a
 * permissive header, not merely that it never adds one.
 */
function stubYogaResponseWithPermissiveDefaultCors(requestOrigin: string | null): Response {
  const response = stubGraphqlResponse();
  if (requestOrigin) {
    response.headers.set("Access-Control-Allow-Origin", requestOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

describe("isOriginTrusted", () => {
  it("returns the origin when it is in the stage's trusted-origin allowlist", () => {
    expect(isOriginTrusted(TRUSTED_ORIGIN, STAGE)).toBe(TRUSTED_ORIGIN);
  });

  it("returns an empty string for an origin outside the allowlist", () => {
    expect(isOriginTrusted(UNTRUSTED_ORIGIN, STAGE)).toBe("");
  });
});

describe("graphqlCorsFetch — actual requests (POST/GET)", () => {
  it("gives an untrusted origin no Access-Control-Allow-Origin, even though Yoga's own response already had one", async () => {
    const request = new Request("http://localhost:8788/graphql", {
      method: "POST",
      headers: { origin: UNTRUSTED_ORIGIN },
    });

    const response = await graphqlCorsFetch(request, STAGE, () =>
      stubYogaResponseWithPermissiveDefaultCors(UNTRUSTED_ORIGIN),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("gives a trusted origin exactly that origin plus Access-Control-Allow-Credentials: true", async () => {
    const request = new Request("http://localhost:8788/graphql", {
      method: "POST",
      headers: { origin: TRUSTED_ORIGIN },
    });

    const response = await graphqlCorsFetch(request, STAGE, () =>
      stubYogaResponseWithPermissiveDefaultCors(TRUSTED_ORIGIN),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(TRUSTED_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("never sends the literal '*' as Access-Control-Allow-Origin while credentials are allowed", async () => {
    const request = new Request("http://localhost:8788/graphql", {
      method: "POST",
      headers: { origin: TRUSTED_ORIGIN },
    });

    const response = await graphqlCorsFetch(request, STAGE, () =>
      stubYogaResponseWithPermissiveDefaultCors(TRUSTED_ORIGIN),
    );

    const acao = response.headers.get("Access-Control-Allow-Origin");
    const acac = response.headers.get("Access-Control-Allow-Credentials");
    // "*" + credentials is rejected outright by browsers, which silently
    // disables the whole policy — the combination must never happen.
    if (acac === "true") {
      expect(acao).not.toBe("*");
    }
    expect(acao).toBe(TRUSTED_ORIGIN);
  });

  it("does not crash and sets no permissive header when there is no Origin header at all", async () => {
    const request = new Request("http://localhost:8788/graphql", { method: "POST" });

    const response = await graphqlCorsFetch(request, STAGE, () =>
      stubYogaResponseWithPermissiveDefaultCors(null),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.status).toBe(200);
  });
});

describe("graphqlCorsFetch — OPTIONS preflight", () => {
  const neverCalled = () => {
    throw new Error("handleGraphql must not run for a CORS preflight");
  };

  it("does not approve a hostile origin's preflight, and never invokes the GraphQL handler", async () => {
    const request = new Request("http://localhost:8788/graphql", {
      method: "OPTIONS",
      headers: { origin: UNTRUSTED_ORIGIN, "access-control-request-method": "POST" },
    });

    const response = await graphqlCorsFetch(request, STAGE, neverCalled);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("approves a trusted origin's preflight with the exact origin", async () => {
    const request = new Request("http://localhost:8788/graphql", {
      method: "OPTIONS",
      headers: { origin: TRUSTED_ORIGIN, "access-control-request-method": "POST" },
    });

    const response = await graphqlCorsFetch(request, STAGE, neverCalled);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(TRUSTED_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});
