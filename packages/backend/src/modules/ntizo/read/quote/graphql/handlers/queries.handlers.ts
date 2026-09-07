import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
// The booking read side's own workspace gate, imported rather than copied.
// It is already exported, it already takes the `providerRead` port
// explicitly, and it is the *same rule* — an administrator, or somebody who
// belongs to the workspace. A second copy is how the quote list and the
// booking list start disagreeing about who may look at one workspace.
import { assertMayReadWorkspace } from "../../../booking/graphql/handlers/queries.handlers";
import type { QuoteReadBootstrap } from "../../bootstrap";
import { quoteReadSchema } from "../schema/queries";

export interface QuoteReadModule {
  readonly quoteRead: QuoteReadBootstrap;
}

/**
 * Somebody's own quotes, so the field refuses an anonymous caller before
 * anything else runs. Copied rather than imported from `write/quote`'s
 * equivalent — tiers do not import each other here, and six lines is not
 * worth a shared helper. Matches `read/booking`'s, `read/activity`'s and
 * `read/notification`'s own copies of the same six lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your quotes",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createQuoteReadHandlers(mod: QuoteReadModule) {
  const uc = mod.quoteRead.useCases;

  return graphqlRoutes(quoteReadSchema)
    .handle("quote.mine", async (args, ctx) =>
      uc.listMine.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
      }),
    )
    .handle("quote.byId", async (args, ctx) =>
      uc.getMine.execute({
        quoteId: args.input.quoteId,
        customerId: requireUser(ctx),
      }),
    )
    .handle("quote.forProvider", async (args, ctx) => {
      await assertMayReadWorkspace(
        asNtizoGraphqlContext(ctx),
        args.input.providerId,
        uc.providerRead,
      );
      return uc.listForProvider.execute({
        providerId: args.input.providerId,
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
      });
    })
    .handle("quote.byIdForProvider", async (args, ctx) => {
      // First line of the handler: the read below is filtered on
      // `provider_id` as well, but a caller who does not belong to this
      // workspace is refused before any read runs, not by one coming back
      // empty.
      await assertMayReadWorkspace(
        asNtizoGraphqlContext(ctx),
        args.input.providerId,
        uc.providerRead,
      );
      return uc.getForProvider.execute({
        providerId: args.input.providerId,
        quoteId: args.input.quoteId,
      });
    })
    .handle("quote.countsForProvider", async (args, ctx) => {
      await assertMayReadWorkspace(
        asNtizoGraphqlContext(ctx),
        args.input.providerId,
        uc.providerRead,
      );
      return uc.countsForProvider.execute({ providerId: args.input.providerId });
    })
    .build();
}
