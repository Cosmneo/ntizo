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
  /**
   * Where a new category goes: after everything that already exists.
   *
   * Asked for rather than defaulted to 0. Every new category landing at
   * position zero puts the newest thing first on the home page and silently
   * ties it with every other one created the same way — and a tie is resolved
   * by whatever the database feels like, which is not an order anybody chose.
   */
  nextSortOrder(): Promise<number>;
  /**
   * Writes a complete order: the first id gets 0, the next 1, and so on.
   *
   * The whole list rather than one moved row, and one statement rather than
   * one per row. Moving a category between two others shifts every position
   * after it, so "set this one to 3" is only ever half an instruction.
   */
  reorder(orderedIds: readonly string[]): Promise<void>;
  update(input: UpdateCategoryInput): Promise<void>;
  /** For the uniqueness check, excluding a row when updating it. */
  codeTaken(code: string, exceptId?: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}
