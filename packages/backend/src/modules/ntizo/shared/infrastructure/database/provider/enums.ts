// Provider enums are stored as text in the DB.
import { PROVIDER_STATUSES } from "@ntizo/shared";

export const PROVIDER_TYPES = ["individual", "organization"] as const;

/**
 * Re-exported, not redeclared.
 *
 * This array used to be its own list with a TODO promising to move it. While
 * the TODO sat there the domain's union drifted away from it, so the two
 * disagreed about whether a provider could be rejected — with nothing able to
 * notice, because neither referred to the other.
 */
export { PROVIDER_STATUSES };
export const PROVIDER_MEMBER_ROLES = ["owner", "admin", "staff"] as const;
export const PROVIDER_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
