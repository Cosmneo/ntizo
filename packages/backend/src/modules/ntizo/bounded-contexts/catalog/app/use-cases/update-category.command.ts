import { normaliseCategoryCode } from "../../domain/category-code";
import {
  missingDefaultTranslation,
  usableTranslations,
} from "../../domain/translations";
import {
  CategoryCodeTakenError,
  CategoryNameRequiredError,
  CategoryNotFoundError,
} from "../../domain/exceptions";
import type {
  CategoryRepositoryPort,
  CategoryTranslationInput,
} from "../ports/outbound/category.repository.port";

export interface UpdateCategoryCommandInput {
  categoryId: string;
  code?: string | undefined;
  icon?: string | null | undefined;
  imageKey?: string | null | undefined;
  sortOrder?: number | undefined;
  isActive?: boolean | undefined;
  translations?: readonly CategoryTranslationInput[] | undefined;
}

export class UpdateCategoryCommand {
  constructor(private readonly repo: CategoryRepositoryPort) {}

  async execute(input: UpdateCategoryCommandInput): Promise<{ ok: true }> {
    if (!(await this.repo.exists(input.categoryId))) {
      throw new CategoryNotFoundError(input.categoryId);
    }

    let translations: CategoryTranslationInput[] | undefined;
    if (input.translations) {
      translations = usableTranslations(input.translations).map((t) => ({
        locale: t.locale,
        name: t.name.trim(),
        description: t.description?.trim() || null,
      }));
      // Checked on update too. Emptying the default name is the one edit that
      // would make a live category unreadable in every language at once.
      if (missingDefaultTranslation(translations)) {
        throw new CategoryNameRequiredError();
      }
    }

    // The code is editable but never re-derived from a renamed category: it is
    // in URLs people have already shared, and changing it because somebody
    // fixed a typo in the Portuguese name would break every one of them.
    let code: string | undefined;
    if (input.code !== undefined) {
      code = normaliseCategoryCode(input.code);
      if (!code) throw new CategoryNameRequiredError();
      if (await this.repo.codeTaken(code, input.categoryId)) {
        throw new CategoryCodeTakenError(code);
      }
    }

    await this.repo.update({
      id: input.categoryId,
      ...(code !== undefined ? { code } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(translations !== undefined ? { translations } : {}),
    });
    return { ok: true };
  }
}
