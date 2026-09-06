import type { ProviderStatus } from "./types";

/**
 * Whether this workspace's services can be seen by anybody outside it.
 *
 * The client-side mirror of one column in one WHERE clause: the storefront's
 * browse requires `provider.status = 'active'` (`conditionsFor`,
 * `service-read.repository.ts`) and `ListServicesProjection` re-checks it on
 * every row. `SetServiceStatusCommand` now refuses to publish into a
 * workspace this returns false for, with `PROVIDER_NOT_ACTIVE`.
 *
 * Those three and this one must agree. Until they did, a provider whose
 * workspace was still awaiting approval could publish a service, be told it
 * worked, and never appear anywhere — the dashboard said "published" and the
 * browse had never heard of them.
 *
 * Written as "active, and nothing else" rather than a list of the statuses
 * that are not: `ProviderStatus` is a widened string because the column is
 * plain text with a CHECK, so a status added on the server that this client
 * has never heard of must read as not-live. Optimism about an unknown value
 * is exactly the failure this function exists to end.
 */
export function isWorkspaceLive(status: ProviderStatus | undefined): boolean {
  return status === "active";
}

/**
 * The translation key labelling this workspace in the switcher, or null when
 * it needs none.
 *
 * Null for an approved workspace — which is most rows, and a badge on every
 * row is a badge nobody reads. The switcher already prints the slug beside
 * the name because several workspaces can share a name; this adds the one
 * thing the slug cannot say, which is that picking this row means working
 * somewhere invisible.
 *
 * That combination is exactly how the original bug was reachable: two
 * workspaces, same name, different slugs, one approved and one not, and
 * nothing on either row to tell them apart on the axis that mattered.
 *
 * Anything not recognised is labelled rather than left bare, for the same
 * reason {@link isWorkspaceLive} refuses to guess: an unlabelled row reads
 * as the working one.
 */
export function workspaceStatusBadgeKey(status: ProviderStatus | undefined): string | null {
  if (isWorkspaceLive(status)) return null;
  return status === "suspended"
    ? "workspaceStatus.badgeSuspended"
    : "workspaceStatus.badgePending";
}
