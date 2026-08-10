import type { NtizoGraphqlContext } from "../../../../graphql/context";
import { requireRequesterUserId } from "../../../../graphql/context";
import type {
  GetCurrentUserProjectionInput,
  ListMyAddressesInput,
} from "../../app/ports/inbound";

/** The session — never the args — supplies the requester id. */
export function mapGetCurrentUserInput(
  ctx: NtizoGraphqlContext,
): GetCurrentUserProjectionInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}

/** Same rule: the session supplies the owner, the args supply nothing. */
export function mapListMyAddressesInput(
  ctx: NtizoGraphqlContext,
): ListMyAddressesInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}
