import type { CategoryDTO } from "@ntizo/shared/read-models";
import { resolveTranslation } from "../../../../bounded-contexts/catalog/domain/translations";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { CategoryReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/category-read.repository.port";

/** Hard ceiling. Nobody scrolls a hundred tiles at once. */
export const MAX_CATEGORY_PAGE = 48;

export interface ListCategoriesInput {
  locale: string;
  limit: number;
  offset: number;
}

export interface ListCategoriesOutput {
  items: CategoryDTO[];
  /**
   * Where the next page starts, or null at the end.
   *
   * A cursor rather than a total: the page loads as it is scrolled, and what
   * it needs to know is "is there more and from where", not how many there
   * are altogether. A total would be a second query over the same rows to
   * answer a question nothing on the page asks.
   */
  nextOffset: number | null;
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

  async execute(input: ListCategoriesInput): Promise<ListCategoriesOutput> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_CATEGORY_PAGE);
    const offset = Math.max(input.offset, 0);

    // One more than asked for: whether another page exists is then a length
    // check rather than a second round trip, and the extra row is discarded.
    const rows = await this.repo.listActive(limit + 1, offset);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: CategoryDTO[] = [];
    for (const r of page) {
      const t = resolveTranslation(r.translations, input.locale);
      if (!t) continue;
      items.push({
        id: r.id,
        code: r.code,
        name: t.name,
        description: t.description,
        imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
        icon: r.icon,
        isFallback: t.isFallback,
      });
    }

    // Advanced by the page size, not by `items.length`. A row dropped for
    // having no readable name still occupied a position in the underlying
    // order, and paging by the shorter number would fetch it again forever.
    return { items, nextOffset: hasMore ? offset + limit : null };
  }
}
