import type { CategoryDTO } from "@ntizo/shared/read-models";
import { resolveTranslation } from "../../../../bounded-contexts/catalog/domain/translations";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { CategoryReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/category-read.repository.port";

export interface ListCategoriesInput {
  locale: string;
}

/**
 * The categories a customer browses, already in their language.
 *
 * Resolved here rather than in the client so the fallback rule lives in one
 * place. A category whose default-locale name is somehow missing is dropped
 * rather than rendered blank — an unreadable tile is worse than one fewer.
 */
export class ListCategoriesProjection {
  constructor(private readonly repo: CategoryReadRepositoryPort) {}

  async execute(input: ListCategoriesInput): Promise<CategoryDTO[]> {
    const rows = await this.repo.listActive();
    const out: CategoryDTO[] = [];
    for (const r of rows) {
      const t = resolveTranslation(r.translations, input.locale);
      if (!t) continue;
      out.push({
        id: r.id,
        code: r.code,
        name: t.name,
        description: t.description,
        imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
        icon: r.icon,
        isFallback: t.isFallback,
      });
    }
    return out;
  }
}
