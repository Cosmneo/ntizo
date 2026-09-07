import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { FavouriteReadBootstrap } from "../../bootstrap";
import { favouriteReadSchema } from "../schema/queries";

export interface FavouriteReadModule {
  readonly favouriteRead: FavouriteReadBootstrap;
}

/**
 * Everything here is somebody's own, so every field refuses an anonymous
 * caller before anything else runs.
 *
 * Copied rather than imported from `read/activity`'s equivalent — tiers do not
 * import each other here, and six lines is not worth a shared helper. The same
 * call `write/favourite`'s handlers make.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see what you saved",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

/**
 * Identity always comes from the session, never from the input. None of the
 * four fields below declares a way to name a different person on its schema,
 * and every one of them is stamped here from `requireUser(ctx)` — so a caller
 * cannot read anybody's lists, marks or memberships but their own.
 *
 * `favouriteList.byId` does take a list id, and that id is a claim rather than
 * proof. The ownership check is `ListListEntriesProjection`'s, not this
 * handler's, because it is a database read and the kit's `argsMapper` is
 * synchronous — the same split `write/favourite`'s handlers document.
 */
export function createFavouriteReadHandlers(mod: FavouriteReadModule) {
  const uc = mod.favouriteRead.useCases;

  return graphqlRoutes(favouriteReadSchema)
    .handle("favourite.marked", async (args, ctx) =>
      uc.marked.execute({
        requesterUserId: requireUser(ctx),
        targetType: args.input.targetType,
        targetIds: args.input.targetIds,
      }),
    )
    .handle("favourite.listsFor", async (args, ctx) =>
      uc.listsForTarget.execute({
        requesterUserId: requireUser(ctx),
        targetType: args.input.targetType,
        targetId: args.input.targetId,
      }),
    )
    .handle("favouriteList.mine", async (_args, ctx) =>
      uc.listMine.execute({ requesterUserId: requireUser(ctx) }),
    )
    .handle("favouriteList.byId", async (args, ctx) =>
      uc.listById.execute({
        requesterUserId: requireUser(ctx),
        listId: args.input.id,
        limit: args.input.limit,
        cursor: args.input.cursor,
        locale: args.input.locale,
      }),
    )
    .build();
}
