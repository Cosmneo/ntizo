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
import { SetServiceMembersCommand } from "../app/use-cases/set-service-members.command";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export function bootstrapCatalog() {
  const categoryRepository = new DrizzleCategoryRepository();
  const serviceRepository = new DrizzleServiceRepository();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  return {
    adapters: { categoryRepository, serviceRepository, unitOfWork, outboxPort },
    useCases: {
      createCategory: new CreateCategoryCommand(categoryRepository),
      updateCategory: new UpdateCategoryCommand(categoryRepository),
      reorderCategories: new ReorderCategoriesCommand(categoryRepository),
      createService: new CreateServiceCommand(serviceRepository, unitOfWork, outboxPort),
      updateService: new UpdateServiceCommand(serviceRepository),
      manageOptions: new ManageOptionsCommand(serviceRepository),
      setServiceStatus: new SetServiceStatusCommand(serviceRepository, unitOfWork, outboxPort),
      setServiceTranslation: new SetServiceTranslationCommand(serviceRepository),
      setServiceMembers: new SetServiceMembersCommand(serviceRepository),
    },
  };
}

export type CatalogBootstrap = ReturnType<typeof bootstrapCatalog>;
