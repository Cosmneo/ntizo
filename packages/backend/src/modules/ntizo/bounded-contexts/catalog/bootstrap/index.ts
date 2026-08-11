import { DrizzleCategoryRepository } from "../infrastructure/repositories/drizzle/category.repository";
import { DrizzleServiceRepository } from "../infrastructure/repositories/drizzle/service.repository";
import { CreateCategoryCommand } from "../app/use-cases/create-category.command";
import { UpdateCategoryCommand } from "../app/use-cases/update-category.command";
import { ReorderCategoriesCommand } from "../app/use-cases/reorder-categories.command";
import { CreateServiceCommand } from "../app/use-cases/create-service.command";
import { UpdateServiceCommand } from "../app/use-cases/update-service.command";
import { ManageOptionsCommand } from "../app/use-cases/manage-options.command";
import { SetServiceStatusCommand } from "../app/use-cases/set-service-status.command";
import { SetServiceTranslationCommand } from "../app/use-cases/set-service-translation.command";

export function bootstrapCatalog() {
  const categoryRepository = new DrizzleCategoryRepository();
  const serviceRepository = new DrizzleServiceRepository();
  return {
    adapters: { categoryRepository, serviceRepository },
    useCases: {
      createCategory: new CreateCategoryCommand(categoryRepository),
      updateCategory: new UpdateCategoryCommand(categoryRepository),
      reorderCategories: new ReorderCategoriesCommand(categoryRepository),
      createService: new CreateServiceCommand(serviceRepository),
      updateService: new UpdateServiceCommand(serviceRepository),
      manageOptions: new ManageOptionsCommand(serviceRepository),
      setServiceStatus: new SetServiceStatusCommand(serviceRepository),
      setServiceTranslation: new SetServiceTranslationCommand(serviceRepository),
    },
  };
}

export type CatalogBootstrap = ReturnType<typeof bootstrapCatalog>;
