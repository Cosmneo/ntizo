import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  category,
  categoryTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import type {
  CategoryRepositoryPort,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../../../app/ports/outbound/category.repository.port";

export class DrizzleCategoryRepository implements CategoryRepositoryPort {
  async create(input: CreateCategoryInput): Promise<string> {
    // One transaction: a category with no name is a row nothing can render,
    // and two statements outside a transaction is exactly how you get one.
    return getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(category)
        .values({
          code: input.code,
          icon: input.icon ?? null,
          imageKey: input.imageKey ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        })
        .returning({ id: category.id });

      const id = row!.id;
      if (input.translations.length > 0) {
        await tx.insert(categoryTranslation).values(
          input.translations.map((t) => ({
            categoryId: id,
            locale: t.locale,
            name: t.name,
            description: t.description ?? null,
          })),
        );
      }
      return id;
    });
  }

  async update(input: UpdateCategoryInput): Promise<void> {
    const { id, translations, ...fields } = input;

    await getDb().transaction(async (tx) => {
      // Only when there is something to set: an update of nothing but the
      // translations must not become `SET` with no assignments, which is a
      // syntax error rather than a no-op.
      if (Object.keys(fields).length > 0) {
        await tx
          .update(category)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(category.id, id));
      }

      if (translations !== undefined) {
        // Replaced wholesale rather than upserted, because clearing a language
        // has to be expressible and an upsert can only ever add.
        await tx
          .delete(categoryTranslation)
          .where(eq(categoryTranslation.categoryId, id));
        if (translations.length > 0) {
          await tx.insert(categoryTranslation).values(
            translations.map((t) => ({
              categoryId: id,
              locale: t.locale,
              name: t.name,
              description: t.description ?? null,
            })),
          );
        }
      }
    });
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await getDb()
      .select({ max: sql<number | null>`max(${category.sortOrder})` })
      .from(category);
    return (row?.max ?? -1) + 1;
  }

  async reorder(orderedIds: readonly string[]): Promise<void> {
    // One UPDATE with a CASE, not one per row. A loop would leave the list
    // half-reordered for as long as it ran, and any read landing in the middle
    // would see two categories claiming the same position.
    const cases = sql.join(
      orderedIds.map((id, i) => sql`when ${category.id} = ${id}::uuid then ${i}`),
      sql` `,
    );
    await getDb()
      .update(category)
      .set({
        sortOrder: sql`case ${cases} else ${category.sortOrder} end`,
        updatedAt: new Date(),
      })
      .where(inArray(category.id, [...orderedIds]));
  }

  async codeTaken(code: string, exceptId?: string): Promise<boolean> {
    const where = exceptId
      ? and(eq(category.code, code), ne(category.id, exceptId))
      : eq(category.code, code);
    const [row] = await getDb()
      .select({ n: sql<number>`1` })
      .from(category)
      .where(where)
      .limit(1);
    return row !== undefined;
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ n: sql<number>`1` })
      .from(category)
      .where(eq(category.id, id))
      .limit(1);
    return row !== undefined;
  }
}
