// Provider enums are defined in the domain layer / @ntizo/shared and stored as text in the DB.
// TODO(ntizo): move to @ntizo/shared/enums once the BC is wired into the shared package.
export const PROVIDER_TYPES = ["individual", "organization"] as const;
export const PROVIDER_STATUSES = [
  "pending",
  "active",
  "suspended",
  "archived",
] as const;
export const PROVIDER_MEMBER_ROLES = ["owner", "admin", "staff"] as const;
export const PROVIDER_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
