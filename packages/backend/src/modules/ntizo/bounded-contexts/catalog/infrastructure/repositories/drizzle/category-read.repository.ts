import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  category,
  categoryTranslation,
  service,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type {
  CategoryReadRepositoryPort,
  CategoryRow,
} from "../../../app/ports/outbound/category-read.repository.port";

/**
 * Categories with their translations, in one query.
 *
 * Aggregated in SQL rather than fetched per row: eight categories with eight
 * languages each is nine round trips done the obvious way, and it grows with
 * both. `filter (where locale is not null)` matters — a left join with no
 * translations yields one null row, and `json_agg` would turn that into an
 * array containing `null` rather than an empty one.
 */
export class DrizzleCategoryReadRepository implements CategoryReadRepositoryPort {
  private base(where?: ReturnType<typeof eq>) {
    const q = getDb()
      .select({
        id: category.id,
        code: category.code,
        imageKey: category.imageKey,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        createdAt: category.createdAt,
        translations: sql<
          { locale: string; name: string; description: string | null }[]
        >`coalesce(
          json_agg(
            json_build_object(
              'locale', ${categoryTranslation.locale},
              'name', ${categoryTranslation.name},
              'description', ${categoryTranslation.description}
            ) order by ${categoryTranslation.locale}
          ) filter (where ${categoryTranslation.locale} is not null),
          '[]'::json
        )`,
      })
      .from(category)
      .leftJoin(
        categoryTranslation,
        eq(categoryTranslation.categoryId, category.id),
      )
      .groupBy(category.id)
      .orderBy(asc(category.sortOrder), asc(category.code));
    return where ? q.where(where) : q;
  }

  async listAll(search: string | undefined): Promise<CategoryRow[]> {
    if (!search) return (await this.base()) as CategoryRow[];
    // Searched across the code and every language's name: an administrator
    // typing "Plumbing" must find the category whether or not they are working
    // in English. The subquery is what lets the name filter survive the
    // grouping — filtering the joined rows would drop the other translations
    // from the row it found.
    const rows = await this.base(
      sql`(
        ${category.code} ilike ${"%" + search + "%"}
        or exists (
          select 1 from ${categoryTranslation} t
          where t.category_id = ${category.id} and t.name ilike ${"%" + search + "%"}
        )
      )` as never,
    );
    return rows as CategoryRow[];
  }

  /**
   * The categories a customer may usefully browse: active, *and* with
   * something behind them.
   *
   * The `exists` is the point. A category with no published service from an
   * active provider is a tile that leads to an empty results page — the one
   * thing a home page's category rail must never do, because the reader has
   * no way to tell "nobody does this yet" from "the site is broken".
   *
   * The second `exists` is a different failure, and the one that emptied the
   * home page. `ListCategoriesProjection` drops a row whose name it cannot
   * resolve, but it does so *after* paging -- so a page of four filled with
   * untranslated rows returns zero items alongside a `nextOffset` insisting
   * there is more. That is exactly what dev served: the database carries 34
   * leftover categories from the catalog, search and sweep suites
   * (`catalog-sweep-test-...`, `svc-search-test-...`), active, sorted to
   * position 0, most with no translation at all. Nine real categories sat
   * behind them and none reached the page.
   *
   * Filtering here rather than harder in the projection is what makes the
   * paging honest: every row this returns is one a reader can actually be
   * shown, so "there is another page" means there is another page.
   *
   * Deliberately not `listAll`'s problem: an administrator must still see and
   * edit a category before anybody sells in it, and must be able to find an
   * untranslated one in order to translate it.
   */
  async listActive(limit: number, offset: number): Promise<CategoryRow[]> {
    const rows = await this.base(
      and(
        eq(category.isActive, true),
        sql`exists (
          select 1
          from ${service} s
          join ${provider} p on p.id = s.provider_id
          where s.category_id = ${category.id}
            and s.status = 'published'
            and p.status = 'active'
        )`,
        sql`exists (
          select 1 from ${categoryTranslation} t
          where t.category_id = ${category.id}
        )`,
      ) as never,
    )
      .limit(limit)
      .offset(offset);
    return rows as CategoryRow[];
  }
}
