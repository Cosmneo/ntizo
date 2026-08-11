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
  /** Active categories with every translation; the caller resolves a locale. */
  listActive(): Promise<CategoryRow[]>;
}

export type { CategoryAdminDTO };
