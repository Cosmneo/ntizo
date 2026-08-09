import { API_BASE_URL, AUTH_API_URL_FALLBACK } from "@/shared/lib/api/auth-client";
import { GraphqlError, type GraphqlErrorEntry } from "./session-graphql";

/**
 * The endpoint to POST to, which differs between the server and the browser.
 *
 * In dev `API_BASE_URL` is `""` — same-origin, so `/public/graphql` goes
 * through the Vite proxy and keeps cookies first-party. That works in a
 * browser, which resolves a relative URL against the page. It does NOT work
 * during SSR: there is no page and no origin, and `fetch("/public/graphql")`
 * throws "Failed to parse URL". The render then falls over into the error
 * boundary and ships a page with no content — which for a route that exists to
 * be crawled is the one outcome that matters.
 *
 * On the server we therefore go straight to the worker, bypassing the proxy.
 * The proxy is a browser-side convenience for cookie scoping, and this endpoint
 * sends no cookies at all.
 */
function endpoint(): string {
  const base = API_BASE_URL || (typeof window === "undefined" ? AUTH_API_URL_FALLBACK : "");
  return `${base}/public/graphql`;
}

/** How much of a non-JSON body to echo back in the thrown error's message. */
const RAW_BODY_PREVIEW_LENGTH = 200;

/**
 * Transport for the anonymous `/public/graphql` endpoint.
 *
 * The one meaningful difference from `sessionGraphql` is `credentials: "omit"`,
 * and it is deliberate on both ends: the backend never sends
 * `access-control-allow-credentials` for this mount and strips cookie and
 * authorization off the request, so attaching them here would only send a
 * session token somewhere that has no use for it.
 *
 * It also runs during SSR, where there is no browser to attach cookies anyway —
 * so a public query behaves identically on the server and after hydration,
 * which is what keeps the rendered HTML and the hydrated page in agreement.
 *
 * A GraphQL failure normally arrives as HTTP 200 with a populated `errors`
 * array, not a 4xx, so a status check alone would silently return undefined.
 */
export async function publicGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let payload: { data?: T; errors?: GraphqlErrorEntry[] };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    const preview =
      text.length > RAW_BODY_PREVIEW_LENGTH
        ? `${text.slice(0, RAW_BODY_PREVIEW_LENGTH)}…`
        : text;
    throw new GraphqlError(response.status, [
      { message: `Non-JSON response (HTTP ${response.status}): ${preview}` },
    ]);
  }

  if (payload.errors?.length) throw new GraphqlError(response.status, payload.errors);
  if (!payload.data) {
    throw new GraphqlError(response.status, [{ message: "Public GraphQL returned no data" }]);
  }
  return payload.data;
}
