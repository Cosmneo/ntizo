export type UserRole =
  | "customer"
  | "individual_provider"
  | "organization_owner"
  | "admin";

export type UserStatus = "active" | "pending" | "suspended";

export type VerificationStatus = "pending" | "verified" | "rejected";
