import { DEFAULT_LOCALE } from "@ntizo/shared";
import { normaliseCategoryCode } from "../../domain/category-code";
import {
  missingDefaultTranslation,
  usableTranslations,
} from "../../domain/translations";
import {
  CategoryCodeTakenError,
  CategoryNameRequiredError,
} from "../../domain/exceptions";
import type {
  CategoryRepositoryPort,
  CategoryTranslationInput,
} from "../ports/outbound/category.repository.port";

export interface CreateCategoryCommandInput {
  /**
   * Optional. Left out, it is derived from the default-locale name — which is
   * what the form does, so nobody has to hand-write a URL segment.
   */
  code?: string | undefined;
  icon?: string | null | undefined;
  imageKey?: string | null | undefined;
  sortOrder?: number | undefined;
  isActive?: boolean | undefined;
  translations: readonly CategoryTranslationInput[];
}

export class CreateCategoryCommand {
  constructor(private readonly repo: CategoryRepositoryPort) {}

  async execute(input: CreateCategoryCommandInput): Promise<{ categoryId: string }> {
    const translations = usableTranslations(input.translations);
    if (missingDefaultTranslation(translations)) {
      throw new CategoryNameRequiredError();
    }

    // Derived from the name the platform speaks, never from whichever language
    // the administrator happened to be using: the code has to be the same
    // handle for everybody, and deriving it from the French name would give
    // one category a French URL and the next an Italian one.
    // `missingDefaultTranslation` above guarantees this row exists; taking the
    // first non-blank name instead would let the order the form happened to
    // send its boxes in decide the URL.
    const source = input.code?.trim()
      ? input.code
      : translations.find((t) => t.locale === DEFAULT_LOCALE)!.name;
    const code = normaliseCategoryCode(source);
    if (!code) throw new CategoryNameRequiredError();
    if (await this.repo.codeTaken(code)) throw new CategoryCodeTakenError(code);

    const categoryId = await this.repo.create({
      code,
      icon: input.icon ?? null,
      imageKey: input.imageKey ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      translations: translations.map((t) => ({
        locale: t.locale,
        name: t.name.trim(),
        description: t.description?.trim() || null,
      })),
    });
    return { categoryId };
  }
}
