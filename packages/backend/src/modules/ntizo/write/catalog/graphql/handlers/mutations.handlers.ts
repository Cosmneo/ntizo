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
    .build();
}
