import type { NtizoGraphqlContext } from "../../../../graphql/context";
import { requireRequesterUserId } from "../../../../graphql/context";
import type {
  GetProviderDetailProjectionInput,
  ListMyProvidersProjectionInput,
} from "../../app/ports/inbound";

/** The session — never the args — supplies the requester id. */
export function mapListMyProvidersInput(
  ctx: NtizoGraphqlContext,
): ListMyProvidersProjectionInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}

export function mapGetProviderDetailInput(
  args: { providerId: string },
  ctx: NtizoGraphqlContext,
): GetProviderDetailProjectionInput {
  return {
    providerId: args.providerId,
    requestedByUserId: requireRequesterUserId(ctx),
  };
}
