export interface CategoryTranslationInput {
  locale: string;
  name: string;
  description?: string | null;
}

export interface CreateCategoryInput {
  code: string;
  icon?: string | null;
  imageKey?: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: readonly CategoryTranslationInput[];
}

export interface UpdateCategoryInput {
  id: string;
  code?: string;
  icon?: string | null;
  imageKey?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /**
   * The complete set, when given. Absent leaves the existing ones alone;
   * present replaces them wholesale, so removing a language is expressible —
   * a merge could only ever add, and an administrator who clears the French
   * box means to clear it.
   */
  translations?: readonly CategoryTranslationInput[];
}

export interface CategoryRepositoryPort {
  create(input: CreateCategoryInput): Promise<string>;
  update(input: UpdateCategoryInput): Promise<void>;
  /** For the uniqueness check, excluding a row when updating it. */
  codeTaken(code: string, exceptId?: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}
