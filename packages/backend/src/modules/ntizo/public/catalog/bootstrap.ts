import { DrizzleCategoryReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/category-read.repository";
import { DrizzlePerformerReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/performer-read.repository";
import { DrizzleServiceReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import { GetServiceProjection } from "./app/use-cases/get-service.projection";
import { ListCategoriesProjection } from "./app/use-cases/list-categories.projection";
import { ListServicesProjection } from "./app/use-cases/list-services.projection";
import { ListServiceCitiesProjection } from "./app/use-cases/list-service-cities.projection";
import type { CatalogPublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapCatalogPublic(): {
  adapters: {
    categoryReadRepository: DrizzleCategoryReadRepository;
    serviceReadRepository: DrizzleServiceReadRepository;
    performerReadRepository: DrizzlePerformerReadRepository;
  };
  useCases: CatalogPublicModule;
} {
  // The same repository the provider's own list and the admin list read
  // through. All three want the underlying data; only the projections differ,
  // and that is the whole difference between the tiers.
  const categoryReadRepository = new DrizzleCategoryReadRepository();
  const serviceReadRepository = new DrizzleServiceReadRepository();
  const performerReadRepository = new DrizzlePerformerReadRepository();
  return {
    adapters: { categoryReadRepository, serviceReadRepository, performerReadRepository },
    useCases: {
      listCategories: new ListCategoriesProjection(categoryReadRepository),
      listServices: new ListServicesProjection(serviceReadRepository),
      getService: new GetServiceProjection(serviceReadRepository, performerReadRepository),
      listServiceCities: new ListServiceCitiesProjection(serviceReadRepository),
    },
  };
}

export type CatalogPublicBootstrap = ReturnType<typeof bootstrapCatalogPublic>;
