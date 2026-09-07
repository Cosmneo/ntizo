import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { FavouriteBootstrap } from "../../../../bounded-contexts/favourite/bootstrap";
import { favouriteWriteSchema } from "../schema/mutations";

export interface FavouriteWriteModule {
  readonly favourite: FavouriteBootstrap;
}

/**
 * Refuses an anonymous caller. Everything else — whether a list id is
 * theirs, whether a name collides with one they already have — is the
 * command's job, because each of those is a database read and the kit's
 * argsMapper is synchronous.
 *
 * Copied rather than imported from `write/communication`'s equivalent: tiers
 * do not import each other here, and six lines is not worth a shared helper
 * — same call `write/review`'s, `write/notification`'s and `write/booking`'s
 * handlers make.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to save a listing",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

/**
 * Identity always comes from the session, never from the input. None of the
 * five fields below declares a way to name a different person on its
 * schema, and every one of them is stamped here from `requireUser(ctx)` — so
 * a caller cannot save, unsave, or manage a list as anybody but themselves.
 */
export function createFavouriteWriteHandlers(mod: FavouriteWriteModule) {
  const uc = mod.favourite.useCases;

  return graphqlRoutes(favouriteWriteSchema)
    .handle("favourite.quickSave", async (args, ctx) =>
      uc.quickSave.execute({
        requesterUserId: requireUser(ctx),
        targetType: args.input.targetType,
        targetId: args.input.targetId,
      }),
    )
    .handle("favourite.setLists", async (args, ctx) =>
      uc.setLists.execute({
        requesterUserId: requireUser(ctx),
        targetType: args.input.targetType,
        targetId: args.input.targetId,
        listIds: args.input.listIds,
      }),
    )
    .handle("favouriteList.create", async (args, ctx) =>
      uc.createList.execute({
        requesterUserId: requireUser(ctx),
        name: args.input.name,
      }),
    )
    .handle("favouriteList.rename", async (args, ctx) => {
      // `RenameListCommand.execute` resolves `void` — a rename has nothing
      // to report beyond success, and `RenameListPort` stays typed that way
      // — but the mutation's output is `{ id: string }` so the caller that
      // just renamed a list can key its update off the same id it sent,
      // without a second round trip to fetch it back. The echo is this
      // handler's job, not the command's.
      await uc.renameList.execute({
        requesterUserId: requireUser(ctx),
        listId: args.input.id,
        name: args.input.name,
      });
      return { id: args.input.id };
    })
    .handle("favouriteList.remove", async (args, ctx) =>
      uc.removeList.execute({
        requesterUserId: requireUser(ctx),
        listId: args.input.id,
      }),
    )
    .build();
}
