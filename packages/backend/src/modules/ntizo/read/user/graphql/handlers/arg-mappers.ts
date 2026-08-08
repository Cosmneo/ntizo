import type { NtizoGraphqlContext } from "../../../../graphql/context";
import { requireRequesterUserId } from "../../../../graphql/context";
import type { GetCurrentUserProjectionInput } from "../../app/ports/inbound";

/** The session — never the args — supplies the requester id. */
export function mapGetCurrentUserInput(
  ctx: NtizoGraphqlContext,
): GetCurrentUserProjectionInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}
