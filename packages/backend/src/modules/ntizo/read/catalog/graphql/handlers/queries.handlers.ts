import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { catalogReadSchema } from "../schema/queries";
import type { ListCategoriesForAdminProjection } from "../../app/use-cases/list-categories-for-admin.projection";

export interface CatalogReadModule {
  readonly listCategoriesForAdmin: ListCategoriesForAdminProjection;
}

export function createCatalogReadHandlers(readModule: CatalogReadModule) {
  return graphqlRoutes(catalogReadSchema)
    .handleWithUseCase("category.allForAdmin", {
      argsMapper: (args, ctx) => {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId || role !== "admin") {
          throw new ForbiddenError({
            message: "Only administrators may list every category",
            code: "ADMIN_ONLY",
          });
        }
        return { search: args.input.search };
      },
      useCase: readModule.listCategoriesForAdmin,
      responseMapper: (output) => output,
    })
    .build();
}
