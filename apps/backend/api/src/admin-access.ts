import { bootstrapUserRead } from "@ntizo/backend/modules/ntizo/read/user";

/**
 * Whether this user administers the platform.
 *
 * Read from the database rather than from the session: the session carries
 * whatever was true when it was issued, and a role revoked an hour ago has to
 * take effect on the next request rather than at the next sign-in. Same source
 * the GraphQL context uses, so the REST upload and the mutations cannot
 * disagree about who is an admin.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const repo = bootstrapUserRead().adapters.userReadRepository;
  return (await repo.findPlatformRole(userId)) === "admin";
}
