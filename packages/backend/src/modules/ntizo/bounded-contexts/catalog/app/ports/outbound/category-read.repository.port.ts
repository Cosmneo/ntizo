import type { CategoryAdminDTO } from "@ntizo/shared/read-models";

export interface CategoryTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface CategoryRow {
  id: string;
  code: string;
  imageKey: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  translations: CategoryTranslationRow[];
}

export interface CategoryReadRepositoryPort {
  /** Every category with every translation — the administration view. */
  listAll(search: string | undefined): Promise<CategoryRow[]>;
  /**
   * Active categories with every translation; the caller resolves a locale.
   *
   * Paged, because the page that shows all of them loads as you scroll. One
   * more than asked for is fetched by the projection to answer "is there
   * another page" without a second COUNT over the same rows.
   */
  listActive(limit: number, offset: number): Promise<CategoryRow[]>;
}

export type { CategoryAdminDTO };
