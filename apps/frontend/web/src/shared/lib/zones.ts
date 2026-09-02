import type { CurrentUserDTO } from "@ntizo/shared";

const PROVIDER_ROLES: ReadonlySet<CurrentUserDTO["role"]> = new Set([
  "individual_provider",
  "organization_owner",
]);

export function canAccessAdmin(user: CurrentUserDTO | null): boolean {
  return user?.role === "admin";
}

export function canAccessProvider(
  user: CurrentUserDTO | null,
  providerCount: number,
): boolean {
  if (!user) return false;
  return providerCount > 0 || PROVIDER_ROLES.has(user.role);
}

/**
 * The zones that bring their own chrome.
 *
 * `/provider` and `/admin` each have a sidebar with its own trigger in the
 * header, so the customer bottom bar on top of that is a second navigation
 * offering four destinations that lead out of the zone you are working in.
 *
 * Checkout (`/book`, `/booking`) is deliberately *not* here. It briefly was,
 * on the argument that a slot on hold should not be a swipe away from four
 * exits; the decision (2026-09-02) went the other way — the bar is the
 * phone's navigation and it stays the same on every customer page, checkout
 * included. Only the top of those pages is different: `CheckoutHeader`
 * instead of `SiteHeader`.
 */
const OWN_CHROME = ["provider", "admin"];

/**
 * Whether this path belongs to a zone that draws its own navigation.
 *
 * Compared segment by segment rather than with `startsWith`, because
 * `"/providers".startsWith("/provider")` is true — the public directory of
 * businesses is a customer page and would lose its bottom bar to a prefix
 * test.
 */
export function zoneOwnsChrome(pathname: string): boolean {
  const [first] = pathname.split("/").filter(Boolean);
  return first !== undefined && OWN_CHROME.includes(first);
}

/** True only for app-internal absolute paths ("/x"), never external URLs. */
export function isSafeInternalPath(path: string | null): path is string {
  if (!path || !path.startsWith("/")) return false;
  try {
    const base = "http://localhost";
    return new URL(path, base).origin === base;
  } catch {
    return false;
  }
}

/**
 * Where an authenticated user should land.
 *
 * `providerCount` matters because becoming a provider sets the user's
 * verificationStatus and leaves `role` as "customer" — so ownership, not role,
 * is what makes the provider zone reachable. Delegating to canAccessProvider
 * keeps this in lockstep with the zone switcher; checking role alone would
 * offer a zone that login then refuses to route to.
 */
export function resolvePostLoginDestination(
  user: CurrentUserDTO | null,
  next: string | null,
  providerCount = 0,
): string {
  if (isSafeInternalPath(next)) return next;
  if (canAccessAdmin(user)) return "/admin";
  if (canAccessProvider(user, providerCount)) return "/provider";
  return "/";
}
