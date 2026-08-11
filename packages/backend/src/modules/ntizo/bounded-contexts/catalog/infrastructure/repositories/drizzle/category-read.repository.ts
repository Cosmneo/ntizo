import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  category,
  categoryTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
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

  async listActive(): Promise<CategoryRow[]> {
    return (await this.base(eq(category.isActive, true))) as CategoryRow[];
  }
}
