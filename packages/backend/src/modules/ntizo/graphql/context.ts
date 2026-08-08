import { z } from "zod";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import type { GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { userRoleSchema, type UserRole } from "@ntizo/shared";

/**
 * The single shape of the GraphQL context injected into every ntizo resolver,
 * across all bounded contexts. Resolved once per request from the better-auth
 * session by the API composition root and consumed by every BC's arg-mappers.
 *
 * This is the GraphQL-tier analogue of the REST-tier ExecutionContext: a slim,
 * already-authenticated projection, so use cases never re-resolve the session.
 */
export interface NtizoGraphqlContext {
  /** Authenticated user id, or null for anonymous requests. */
  readonly requesterUserId: string | null;
  readonly email: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  /**
   * The requester's platform role, already narrowed to a known value by the
   * composition root. Non-null even for anonymous requests, where it is
   * `"customer"` — the least-privileged role — so no consumer has to invent a
   * default and accidentally pick a wider one.
   */
  readonly role: UserRole;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export const ntizoGraphqlContextSchema = zodSchema(
  z.object({
    requesterUserId: z.string().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    // Required, not `.nullable()`: the kit validates the context per request,
    // so an omitted role fails the request loudly instead of reaching a
    // resolver as `undefined` and being read as "no role".
    role: userRoleSchema,
    requestId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
  }),
);

/**
 * Narrows the kit's generic handler context to the ntizo shape. The kit
 * validates the context against `defaults.context` per request, so this is a
 * type-level narrowing, not an unchecked assertion.
 */
export function asNtizoGraphqlContext(
  ctx: GraphQLHandlerContext,
): NtizoGraphqlContext {
  return ctx as unknown as NtizoGraphqlContext;
}

/** Throws unless the request carries an authenticated user. */
export function requireRequesterUserId(ctx: NtizoGraphqlContext): string {
  if (!ctx.requesterUserId) {
    throw new Error("[graphql] unauthenticated");
  }
  return ctx.requesterUserId;
}
