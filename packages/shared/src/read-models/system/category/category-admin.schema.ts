import { z } from "zod";
import { LOCALES } from "../../../enums/system-enums";

/** One language's copy for a category. */
export const categoryTranslationReadModel = z.object({
  locale: z.enum(LOCALES),
  name: z.string(),
  description: z.string().nullable(),
});

/**
 * A category as the administration screen sees it: every translation at once.
 *
 * The customer-facing read resolves a single language; this one deliberately
 * does not. An administrator's job here is to see which languages are filled
 * in and which are not, and a resolved name would hide exactly that — a
 * category with no French would show its Portuguese and look complete.
 */
export const categoryAdminReadModel = z.object({
  id: z.string().min(1),
  code: z.string(),
  imageKey: z.string().nullable(),
  imageUrl: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(categoryTranslationReadModel),
  createdAt: z.string(),
});

export type CategoryTranslationDTO = z.infer<typeof categoryTranslationReadModel>;
export type CategoryAdminDTO = z.infer<typeof categoryAdminReadModel>;
