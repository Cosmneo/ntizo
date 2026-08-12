import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { CatalogBootstrap } from "../../../../bounded-contexts/catalog/bootstrap";
import { catalogWriteSchema } from "../schema/mutations";

export interface CatalogWriteModule {
  readonly catalog: CatalogBootstrap;
}

/**
 * Refuses anyone whose platform role is not `admin`.
 *
 * Both the id and the role, not the role alone: the context defaults a caller
 * with no session to `customer`, so a role check by itself would be reading a
 * value chosen for the absence of a user rather than asserted about one.
 */
function requireAdmin(ctx: GraphQLHandlerContext): void {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may change the catalog",
      code: "ADMIN_ONLY",
    });
  }
}

/**
 * Refuses an anonymous caller; the workspace-membership check is the
 * command's job, not the edge's, because it is a query and the kit's
 * argsMapper is synchronous.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to manage services", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

export function createCatalogWriteHandlers(mod: CatalogWriteModule) {
  const uc = mod.catalog.useCases;

  return graphqlRoutes(catalogWriteSchema)
    .handle("category.create", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.createCategory.execute(args.input);
    })
    .handle("category.reorder", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.reorderCategories.execute({ orderedIds: args.input.orderedIds });
    })
    .handle("category.update", async (args, ctx) => {
      requireAdmin(ctx);
      const { categoryId, ...rest } = args.input;
      return uc.updateCategory.execute({ categoryId, ...rest });
    })
    .handle("service.create", async (args, ctx) =>
      uc.createService.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.update", async (args, ctx) =>
      uc.updateService.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.setStatus", async (args, ctx) =>
      uc.setServiceStatus.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.add", async (args, ctx) =>
      uc.manageOptions.add({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.update", async (args, ctx) =>
      uc.manageOptions.update({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.remove", async (args, ctx) =>
      uc.manageOptions.remove({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.reorder", async (args, ctx) =>
      uc.manageOptions.reorder({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.translation.set", async (args, ctx) =>
      uc.setServiceTranslation.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .build();
}
