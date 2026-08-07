import type { UserRole, UserStatus, Locale } from "../../../enums";

export interface CurrentUserDTO {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string; // ISO
  // Profile fields
  name: string; // === displayName (back-compat)
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
  bio: string | null;
  language: Locale;
  timezone: string;
}
