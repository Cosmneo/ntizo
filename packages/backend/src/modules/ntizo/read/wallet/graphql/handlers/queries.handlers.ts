import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { walletReadSchema } from "../schema/queries";
import type { GetProviderWalletProjection } from "../../app/use-cases/get-provider-wallet.projection";
import type { ProviderReadRepositoryPort } from "../../../provider/app/ports/outbound/provider-read.repository.port";

export interface WalletReadModule {
  readonly getProviderWallet: GetProviderWalletProjection;
  /** Only `isMember` is used, and only to answer "may this person look". */
  readonly providerRead: ProviderReadRepositoryPort;
}

export function createWalletReadHandlers(mod: WalletReadModule) {
  return graphqlRoutes(walletReadSchema)
    // `.handle`, not `.handleWithUseCase`: the kit's `argsMapper` is
    // synchronous, and deciding whether this person may look is a query. The
    // check therefore lives in the handler body — still the edge, still the
    // one place that sees both the session and the input.
    .handle("wallet.forProvider", async (args, ctx) => {
      {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId) {
          throw new ForbiddenError({
            message: "Sign in to see a wallet",
            code: "UNAUTHENTICATED",
          });
        }
        // An admin, or somebody who belongs to this workspace. The membership
        // check is a query, so it runs only when the cheaper role check has
        // already failed — and the role is checked against the session's
        // resolved role, not against anything the caller sent.
        const allowed =
          role === "admin" ||
          (await mod.providerRead.isMember(args.input.providerId, requesterUserId));
        if (!allowed) {
          throw new ForbiddenError({
            message: "This wallet belongs to a workspace you are not part of",
            code: "NOT_PROVIDER_MEMBER",
          });
        }
      }
      return mod.getProviderWallet.execute({
        providerId: args.input.providerId,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
      });
    })
    .build();
}
