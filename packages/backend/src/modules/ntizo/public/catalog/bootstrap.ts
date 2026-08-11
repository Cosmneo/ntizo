import { DrizzleCategoryReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/category-read.repository";
import { DrizzleServiceReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import { ListCategoriesProjection } from "./app/use-cases/list-categories.projection";
import { ListServicesProjection } from "./app/use-cases/list-services.projection";
import type { CatalogPublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapCatalogPublic(): {
  adapters: {
    categoryReadRepository: DrizzleCategoryReadRepository;
    serviceReadRepository: DrizzleServiceReadRepository;
  };
  useCases: CatalogPublicModule;
} {
  // The same repository the provider's own list and the admin list read
  // through. All three want the underlying data; only the projections differ,
  // and that is the whole difference between the tiers.
  const categoryReadRepository = new DrizzleCategoryReadRepository();
  const serviceReadRepository = new DrizzleServiceReadRepository();
  return {
    adapters: { categoryReadRepository, serviceReadRepository },
    useCases: {
      listCategories: new ListCategoriesProjection(categoryReadRepository),
      listServices: new ListServicesProjection(serviceReadRepository),
    },
  };
}

export type CatalogPublicBootstrap = ReturnType<typeof bootstrapCatalogPublic>;
