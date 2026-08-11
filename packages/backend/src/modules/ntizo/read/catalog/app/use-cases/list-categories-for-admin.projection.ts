import type { CategoryAdminDTO } from "@ntizo/shared/read-models";
import { localeSchema } from "@ntizo/shared";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { CategoryReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/category-read.repository.port";

export interface ListCategoriesForAdminInput {
  search?: string | undefined;
}

/**
 * Every category with every translation.
 *
 * Deliberately unresolved: an administrator is here to see which languages are
 * filled in and which are not, and handing over a name already chosen for them
 * would hide exactly that.
 */
export class ListCategoriesForAdminProjection {
  constructor(private readonly repo: CategoryReadRepositoryPort) {}

  async execute(input: ListCategoriesForAdminInput): Promise<CategoryAdminDTO[]> {
    const rows = await this.repo.listAll(input.search?.trim() || undefined);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      imageKey: r.imageKey,
      imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
      icon: r.icon,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      translations: r.translations
        // A locale the product has since dropped is still in the table; it is
        // not something the form can edit, so it is not something to show.
        .filter((t) => localeSchema.safeParse(t.locale).success)
        .map((t) => ({
          locale: t.locale as CategoryAdminDTO["translations"][number]["locale"],
          name: t.name,
          description: t.description,
        })),
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
