import { DrizzleCategoryReadRepository } from "../../bounded-contexts/catalog/infrastructure/repositories/drizzle/category-read.repository";
import { ListCategoriesProjection } from "./app/use-cases/list-categories.projection";
import type { CatalogPublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapCatalogPublic(): {
  adapters: { categoryReadRepository: DrizzleCategoryReadRepository };
  useCases: CatalogPublicModule;
} {
  // The same repository the admin list reads through. Both want every
  // translation; only the projections differ, and that is the whole difference
  // between the two tiers.
  const categoryReadRepository = new DrizzleCategoryReadRepository();
  return {
    adapters: { categoryReadRepository },
    useCases: { listCategories: new ListCategoriesProjection(categoryReadRepository) },
  };
}

export type CatalogPublicBootstrap = ReturnType<typeof bootstrapCatalogPublic>;
