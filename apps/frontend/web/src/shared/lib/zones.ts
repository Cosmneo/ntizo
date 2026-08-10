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
