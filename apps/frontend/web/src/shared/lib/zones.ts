import type { CurrentUserDTO } from "@ntizo/shared";

export type Zone = "landing" | "provider" | "admin";

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

export function accessibleZones(
  user: CurrentUserDTO | null,
  providerCount: number,
): Zone[] {
  const zones: Zone[] = ["landing"];
  if (canAccessProvider(user, providerCount)) zones.push("provider");
  if (canAccessAdmin(user)) zones.push("admin");
  return zones;
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

export function resolvePostLoginDestination(
  user: CurrentUserDTO | null,
  next: string | null,
): string {
  if (isSafeInternalPath(next)) return next;
  if (canAccessAdmin(user)) return "/admin";
  if (user && PROVIDER_ROLES.has(user.role)) return "/provider";
  return "/";
}
