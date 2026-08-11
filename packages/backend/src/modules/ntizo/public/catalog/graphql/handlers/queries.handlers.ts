import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { DEFAULT_LOCALE } from "@ntizo/shared";
import { catalogPublicSchema } from "../schema/queries";
import type { ListCategoriesProjection } from "../../app/use-cases/list-categories.projection";
import type { ListServicesProjection } from "../../app/use-cases/list-services.projection";

export interface CatalogPublicModule {
  readonly listCategories: ListCategoriesProjection;
  readonly listServices: ListServicesProjection;
}

export function createCatalogPublicHandlers(mod: CatalogPublicModule) {
  return graphqlRoutes(catalogPublicSchema)
    .handleWithUseCase("category.all", {
      // An absent locale is the platform's default rather than an error: a
      // caller that does not say gets the language the product speaks.
      argsMapper: (args) => ({
        locale: args.input.locale ?? DEFAULT_LOCALE,
        // Enough to fill a wide screen twice over without being a page that
        // pretends to load progressively while fetching everything.
        limit: args.input.limit ?? 24,
        offset: args.input.offset ?? 0,
      }),
      useCase: mod.listCategories,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("service.all", {
      argsMapper: (args) => ({
        locale: args.input.locale ?? DEFAULT_LOCALE,
        categoryCode: args.input.categoryCode,
        limit: args.input.limit ?? 24,
        offset: args.input.offset ?? 0,
      }),
      useCase: mod.listServices,
      responseMapper: (output) => output,
    })
    .build();
}
