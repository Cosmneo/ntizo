import { getAuth } from "@ntizo/backend/modules/better-auth";
import type { NtizoGraphqlContext } from "@ntizo/backend/modules/ntizo/graphql/context";

/**
 * Resolves the per-request GraphQL context from the better-auth session.
 * Anonymous requests get null ids rather than an error — field-level
 * authorization is the arg-mapper's job.
 */
export async function createGraphqlContext(
  request: Request,
): Promise<NtizoGraphqlContext> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const u = session?.user as
    | (NonNullable<typeof session>["user"] & {
        firstName?: string;
        lastName?: string;
      })
    | undefined;

  return {
    requesterUserId: u?.id ?? null,
    email: u?.email ?? null,
    firstName: u?.firstName ?? null,
    lastName: u?.lastName ?? null,
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress:
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  };
}
