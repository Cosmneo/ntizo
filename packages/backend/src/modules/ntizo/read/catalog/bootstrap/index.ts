import { DrizzleCategoryReadRepository } from "../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/category-read.repository";
import { ListCategoriesForAdminProjection } from "../app/use-cases/list-categories-for-admin.projection";
import type { CatalogReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapCatalogRead(): {
  adapters: { categoryReadRepository: DrizzleCategoryReadRepository };
  useCases: CatalogReadModule;
} {
  const categoryReadRepository = new DrizzleCategoryReadRepository();
  return {
    adapters: { categoryReadRepository },
    useCases: {
      listCategoriesForAdmin: new ListCategoriesForAdminProjection(
        categoryReadRepository,
      ),
    },
  };
}

export type CatalogReadBootstrap = ReturnType<typeof bootstrapCatalogRead>;
