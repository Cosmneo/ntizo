import { DrizzleCategoryReadRepository } from "../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/category-read.repository";
import { DrizzleServiceReadRepository } from "../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import { ListCategoriesForAdminProjection } from "../app/use-cases/list-categories-for-admin.projection";
import { ListMyServicesProjection } from "../app/use-cases/list-my-services.projection";
import type { CatalogReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapCatalogRead(): {
  adapters: {
    categoryReadRepository: DrizzleCategoryReadRepository;
    serviceReadRepository: DrizzleServiceReadRepository;
  };
  useCases: CatalogReadModule;
} {
  const categoryReadRepository = new DrizzleCategoryReadRepository();
  const serviceReadRepository = new DrizzleServiceReadRepository();
  return {
    adapters: { categoryReadRepository, serviceReadRepository },
    useCases: {
      listCategoriesForAdmin: new ListCategoriesForAdminProjection(
        categoryReadRepository,
      ),
      listMyServices: new ListMyServicesProjection(serviceReadRepository),
      serviceRead: serviceReadRepository,
    },
  };
}

export type CatalogReadBootstrap = ReturnType<typeof bootstrapCatalogRead>;
