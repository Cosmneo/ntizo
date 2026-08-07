import { resolveTrustedOrigin } from "../middlewares/cors";

/**
 * Origin-restricted CORS enforcement for `/graphql`, applied around the
 * whole Yoga `fetch()` call rather than as an upstream Hono middleware.
 *
 * `/graphql` sits outside `/api/*`, so REST's `authCors` middleware never
 * runs for it by default. Simply registering `authCors` on `/graphql` too
 * is NOT sufficient: GraphQL Yoga bundles its own default CORS plugin
 * (`useCORS`, from `@whatwg-node/server`) into every `createYoga` instance,
 * and `@cosmneo/onion-lasagna-yoga`'s `CreateOnionYogaOptions` does not
 * expose a way to configure or disable it. That plugin reflects any Origin
 * with credentials, and it builds its own `Response` object inside
 * `yoga.fetch()`. Because our route handler returns that `Response`
 * directly, Hono's `cors()` middleware — which sets headers on `c.res`
 * *before* calling `next()` — cannot correct it afterwards: Hono only
 * overlays headers it explicitly set onto whatever `Response` the handler
 * returns, it never strips headers already present on that returned
 * response. (Verified live: wrapping the mount in `authCors` still let
 * hostile Origins see a reflected `Access-Control-Allow-Origin` on real
 * POST/GET requests. OPTIONS preflight alone was fine only because Hono's
 * `cors()` short-circuits before ever invoking Yoga for that method.)
 *
 * So this function owns the entire `/graphql` CORS story end to end and
 * always has the last word on the outgoing response's headers — using the
 * exact same trusted-origin allowlist as REST (`resolveTrustedOrigin`) so
 * the two tiers cannot drift apart.
 */
const ALLOW_METHODS = "GET, POST, OPTIONS";
// Content-Type/Authorization match REST's authCors; x-graphql-csrf is the
// header hardening.ts's useCSRFPrevention requires on every request, so it
// must be allowed here or a legitimate cross-origin browser client could
// never complete a preflight for it once the frontend cuts over (Plan 1B).
const ALLOW_HEADERS = "Content-Type, Authorization, x-graphql-csrf";

export async function graphqlCorsFetch(
  request: Request,
  handleGraphql: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin ? resolveTrustedOrigin(origin) : "";

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      Vary: "Origin",
    });
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    return new Response(null, { status: 204, headers });
  }

  const response = await handleGraphql(request);

  // Rebuild headers from scratch rather than mutating `response.headers` in
  // place — Yoga's own `useCORS` plugin may already have set
  // Access-Control-Allow-Origin/-Credentials on this exact response, and
  // those must never survive for an untrusted origin.
  const headers = new Headers(response.headers);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  const varyValues = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  varyValues.add("Origin");
  headers.set("Vary", [...varyValues].join(", "));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
