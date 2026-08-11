import { DrizzleCategoryRepository } from "../infrastructure/repositories/drizzle/category.repository";
import { CreateCategoryCommand } from "../app/use-cases/create-category.command";
import { UpdateCategoryCommand } from "../app/use-cases/update-category.command";

export function bootstrapCatalog() {
  const categoryRepository = new DrizzleCategoryRepository();
  return {
    adapters: { categoryRepository },
    useCases: {
      createCategory: new CreateCategoryCommand(categoryRepository),
      updateCategory: new UpdateCategoryCommand(categoryRepository),
    },
  };
}

export type CatalogBootstrap = ReturnType<typeof bootstrapCatalog>;
