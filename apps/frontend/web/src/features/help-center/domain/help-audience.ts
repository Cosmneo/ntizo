export type HelpAudience = "customer" | "provider";

/**
 * Whose request the panel would open here.
 *
 * Inside a workspace (`/provider/<slug>/…`) a request is the provider's:
 * every member reads it, and the admin queue names the business. Everywhere
 * else — the public site, the customer zone, and the provider zone's own
 * picker, which names no workspace — it is the person's own.
 *
 * Segment-by-segment, never `startsWith`: `/providers/salao-x` is the public
 * directory, a customer page, and a prefix test would call it the workspace.
 */
export function audienceForPath(pathname: string): { audience: HelpAudience; providerSlug: string | null } {
  const [first, second] = pathname.split("/").filter(Boolean);
  // `no-provider` is the zone's own "you have no workspace" page, not a slug.
  if (first === "provider" && second && second !== "no-provider") {
    return { audience: "provider", providerSlug: second };
  }
  return { audience: "customer", providerSlug: null };
}
