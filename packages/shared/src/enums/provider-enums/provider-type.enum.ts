import { z } from "zod";

/**
 * What kind of provider a workspace is.
 *
 * The distinction the whole product is shaped around: an individual is one
 * person with one calendar, an organization is an establishment whose staff
 * take bookings in parallel. It decides what the onboarding asks, what the
 * workspace offers, and how availability is generated.
 *
 * Here rather than in the aggregate for the same reason `ProviderStatus` is:
 * the frontend needs it too, and a list redeclared on both sides is a list that
 * disagrees eventually.
 */
export enum ProviderType {
  /** A person offering their own labour. One profile, one calendar. */
  Individual = "individual",
  /** A business with staff. Concurrent bookings, invited members, opening hours. */
  Organization = "organization",
}

export const PROVIDER_TYPES = Object.values(ProviderType);

/**
 * The same two values as a zod enum, for GraphQL arguments.
 *
 * Written out rather than derived with `z.nativeEnum(ProviderType)`: the
 * schema generator reads a literal tuple to build the GraphQL type, and a
 * native enum reaches it as an opaque object. The tuple is checked against
 * `PROVIDER_TYPES` by the test beside this file, so the two cannot drift.
 */
export const providerTypeSchema = z.enum(["individual", "organization"]);

/** True for the type whose bookings can overlap, because more than one person works. */
export function supportsConcurrentBookings(type: ProviderType): boolean {
  return type === ProviderType.Organization;
}
