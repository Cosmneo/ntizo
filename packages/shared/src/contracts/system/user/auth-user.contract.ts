// Contract the better-auth module exposes to the rest of the backend.
// This is the minimum shape the Ntizo user BC needs to shadow a Profile
// from an authenticated better-auth user.

export interface AuthUserContract {
  id: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified: boolean;
  createdAt: Date;
}
