import type { Hono } from "hono";
import { publicSchema } from "@ntizo/backend/modules/ntizo/public";
import {
  bootstrapProviderPublic,
  createProviderPublicHandlers,
} from "@ntizo/backend/modules/ntizo/public/provider";
import {
  bootstrapCityPublic,
  createCityPublicHandlers,
} from "@ntizo/backend/modules/ntizo/public/city";
import {
  bootstrapInvitePublic,
  createInvitePublicHandlers,
} from "@ntizo/backend/modules/ntizo/public/invite";
import {
  bootstrapCatalogPublic,
  createCatalogPublicHandlers,
} from "@ntizo/backend/modules/ntizo/public/catalog";
import {
  bootstrapSchedulingPublic,
  createSchedulingPublicHandlers,
} from "@ntizo/backend/modules/ntizo/public/scheduling";
import { buildYoga } from "./build-yoga";
import { buildHardeningPlugins } from "./hardening";
import type { AppBindings } from "../types";

/**
 * Built lazily and memoised for the isolate's lifetime, matching the private
 * mount. The bootstrap opens no I/O — repositories resolve `getDb()` per call —
 * so nothing here is captured across requests.
 */
let yoga: ReturnType<typeof buildYoga> | undefined;

function getYoga(stage: string) {
  if (!yoga) {
    const providerPublic = bootstrapProviderPublic();
    const cityPublic = bootstrapCityPublic();
    const invitePublic = bootstrapInvitePublic();
    const catalogPublic = bootstrapCatalogPublic();
    const schedulingPublic = bootstrapSchedulingPublic();

    yoga = buildYoga({
      schema: publicSchema,
      fields: [
        ...createProviderPublicHandlers(providerPublic.useCases),
        ...createCityPublicHandlers(cityPublic.useCases),
        ...createInvitePublicHandlers(invitePublic.useCases),
        ...createCatalogPublicHandlers(catalogPublic.useCases),
        ...createSchedulingPublicHandlers(schedulingPublic.useCases),
      ] as Parameters<typeof buildYoga>[0]["fields"],
      plugins: buildHardeningPlugins(stage),
      // No context factory. The private mount resolves a session here; this one
      // must not — resolving one would create a requester for handlers that are
      // built to have none, and would put a session lookup on the hot path of
      // every crawler request.
      createContext: () => ({}),
      graphiql: stage !== "prod",
    });
  }
  return yoga;
}

/**
 * CORS for the anonymous endpoint — deliberately the opposite posture to
 * `/graphql`.
 *
 * The private endpoint reflects only trusted origins and allows credentials,
 * because it carries a session. This one serves listings that must be readable
 * by any browser and any crawler, so it echoes `*` and **never** allows
 * credentials. Those two settings are a pair: `Access-Control-Allow-Origin: *`
 * with credentials is rejected by browsers, and allowing credentials here would
 * mean a page on any origin could make an authenticated request — which is
 * precisely the hole the private mount's allowlist exists to close.
 *
 * Nothing behind this endpoint reads a cookie, so there is no session to leak
 * even if a client sends one; the header is what stops the browser attaching it
 * in the first place.
 */
function publicCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

export function mountPublicGraphql(app: Hono<{ Bindings: AppBindings }>) {
  app.all("/public/graphql", async (c) => {
    const stage = c.env.STAGE ?? "local";

    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: publicCorsHeaders() });
    }

    // Strip any credentials the caller attached before the request reaches
    // Yoga. Belt and braces: no handler reads a cookie, but a stray
    // Authorization header reaching a public resolver is the kind of thing that
    // later grows into an accidental auth path.
    const headers = new Headers(c.req.raw.headers);
    headers.delete("cookie");
    headers.delete("authorization");
    const stripped = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      // @ts-expect-error — undici requires this for a streamed body; Workers ignores it.
      duplex: "half",
    });

    const response = await getYoga(stage).fetch(stripped);
    const merged = new Headers(response.headers);
    for (const [k, v] of Object.entries(publicCorsHeaders())) merged.set(k, v);
    // Yoga's bundled CORS may have set a credentials header; it must not survive.
    merged.delete("access-control-allow-credentials");
    return new Response(response.body, {
      status: response.status,
      headers: merged,
    });
  });
}
