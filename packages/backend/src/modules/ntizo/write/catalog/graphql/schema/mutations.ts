import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { LOCALES } from "@ntizo/shared";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * One language's copy, as the form sends it.
 *
 * The name is allowed to arrive empty and is dropped server-side. The form has
 * a box per language and most of them stay blank; refusing the whole save
 * because Dutch is empty would make the optional languages compulsory by
 * accident.
 */
const translationInput = z.object({
  locale: z.enum(LOCALES),
  name: z.string().max(120),
  description: z.string().max(400).nullable().optional(),
});

export const createCategory = defineMutation({
  input: zodSchema(
    z.object({
      // Absent means "derive it from the default-language name", which is what
      // the form sends — nobody should have to hand-write a URL segment.
      code: z.string().trim().max(60).optional(),
      icon: z.string().trim().max(40).nullable().optional(),
      imageKey: z.string().trim().max(300).nullable().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
      translations: z.array(translationInput).min(1),
    }),
  ),
  output: zodSchema(z.object({ categoryId: z.string().min(1) })),
  docs: { summary: "Create a service category", tags: ["Admin", "Catalog"] },
});

export const updateCategory = defineMutation({
  input: zodSchema(
    z.object({
      categoryId: z.string().min(1),
      code: z.string().trim().max(60).optional(),
      icon: z.string().trim().max(40).nullable().optional(),
      // `.nullable()` so removing the image is expressible — an optional-only
      // field can say "leave it" but never "take it away".
      imageKey: z.string().trim().max(300).nullable().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
      /** The complete set. Absent leaves the existing ones alone. */
      translations: z.array(translationInput).optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Update a service category", tags: ["Admin", "Catalog"] },
});

/**
 * A complete order, not a single position.
 *
 * `min(1)` because an empty list is a client bug, not an instruction to leave
 * everything alone — and silently accepting it would hide the bug.
 */
export const reorderCategories = defineMutation({
  input: zodSchema(
    z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Set the display order of every category", tags: ["Admin", "Catalog"] },
});

export const catalogWriteSchema = defineGraphQLSchema(
  {
    category: {
      create: createCategory,
      update: updateCategory,
      reorder: reorderCategories,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
