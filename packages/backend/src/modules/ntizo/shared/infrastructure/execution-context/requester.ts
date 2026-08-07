import type { UserRole } from "@ntizo/shared";

export interface RequesterUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: UserRole;
}

export interface AnonymousRequester {
  type: "anonymous";
}

export interface AuthenticatedRequester {
  type: "authenticated";
  user: RequesterUser;
}

export type Requester = AnonymousRequester | AuthenticatedRequester;

export function getRequesterDisplayName(user: RequesterUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}
