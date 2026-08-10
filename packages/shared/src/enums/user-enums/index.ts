import { z } from "zod";

/**
 * The canonical role list. Runtime value first, type derived from it, so the
 * two can never drift.
 *
 * This needs a runtime guard rather than a cast because nothing upstream
 * constrains the value: better-auth declares `role` as a plain `string` field
 * and the column is `text ... default 'customer'`, with no CHECK and no enum.
 * Anything that reaches that column reaches authorization.
 */
export const USER_ROLES = [
  "customer",
  "individual_provider",
  "organization_owner",
  "admin",
] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export type UserRole = (typeof USER_ROLES)[number];

/**
 * Narrows an untrusted value to a `UserRole`, falling back to `"customer"`.
 *
 * The fallback is the least-privileged role on purpose: an unrecognised value
 * must never widen access. Use this at every boundary where a role crosses
 * from storage or a session into an authorization decision — never `as UserRole`.
 */
export function toUserRole(value: unknown): UserRole {
  const parsed = userRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "customer";
}

export type UserStatus = "active" | "pending" | "suspended";

export type VerificationStatus = "pending" | "verified" | "rejected";

/**
 * Gender, as offered on the profile.
 *
 * "undisclosed" is a value the user can choose, distinct from the column
 * being null — null means "never asked or never answered", this means "asked
 * and declined". Collapsing the two would lose the difference the moment
 * anyone reports on it.
 */
export const GENDERS = ["female", "male", "other", "undisclosed"] as const;

export const genderSchema = z.enum(GENDERS);

export type Gender = (typeof GENDERS)[number];
