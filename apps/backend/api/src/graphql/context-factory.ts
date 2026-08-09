import { getAuth } from "@ntizo/backend/modules/better-auth";
import type { NtizoGraphqlContext } from "@ntizo/backend/modules/ntizo/graphql/context";
import type { UserReadRepositoryPort } from "@ntizo/backend/modules/ntizo/read/user";

export interface GraphqlContextDeps {
  /** Supplies the authoritative platform role. See `findPlatformRole`. */
  userRead: Pick<UserReadRepositoryPort, "findPlatformRole">;
}

/**
 * Builds the per-request GraphQL context resolver.
 *
 * The identity comes from the better-auth session, but **the role does not**.
 * There are two `role` columns: `better_auth.user.role`, which exists because
 * better-auth needs one and is what the session carries, and
 * `ntizo_user.user.role`, which the Ntizo user BC owns and which `userMe`
 * projects to the UI. Nothing synchronises them. Taking the role off the
 * session meant authorization could enforce one role while the UI displayed
 * another — invisible until the first admin check is written, and then wrong
 * in the direction nobody tests.
 *
 * The cost is one primary-key lookup per authenticated GraphQL request, on a
 * request that is already resolving a session against the same database.
 * Anonymous requests skip it entirely.
 *
 * Anonymous callers get null ids rather than an error — field-level
 * authorization is the arg-mapper's job.
 */
export function createGraphqlContextFactory(deps: GraphqlContextDeps) {
  return async function createGraphqlContext(
    request: Request,
  ): Promise<NtizoGraphqlContext> {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const u = session?.user as
      | (NonNullable<typeof session>["user"] & {
          firstName?: string;
          lastName?: string;
        })
      | undefined;

    // Least privilege on every path that is not a confirmed authenticated
    // user with an ntizo row: anonymous, and the should-not-happen case of a
    // session whose ntizo user row is missing, both land on "customer".
    const role = u?.id ? ((await deps.userRead.findPlatformRole(u.id)) ?? "customer") : "customer";

    return {
      requesterUserId: u?.id ?? null,
      email: u?.email ?? null,
      firstName: u?.firstName ?? null,
      lastName: u?.lastName ?? null,
      role,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress:
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    };
  };
}
