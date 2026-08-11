import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  LOCALES,
  serviceBookingModeSchema,
  serviceLocationTypeSchema,
  servicePricingModeSchema,
  serviceStatusSchema,
  localeSchema,
} from "@ntizo/shared";
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

const optionShape = z.object({
  pricingMode: servicePricingModeSchema,
  amountMinor: z.number().int().min(1),
  currency: z.string().length(3),
  // Nullable, not merely optional: an hourly option must be able to say "no
  // duration", and an optional-only field can say "leave it" but never
  // "there is none".
  durationMinutes: z.number().int().min(1).nullable(),
  minMinutes: z.number().int().min(1).nullable(),
  stepMinutes: z.number().int().min(1).nullable(),
  name: z.string().trim().min(1).max(120),
});

export const createService = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      categoryId: z.string().min(1),
      sourceLocale: localeSchema,
      locationType: serviceLocationTypeSchema,
      bookingMode: serviceBookingModeSchema,
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ serviceId: z.string().min(1) })),
  docs: { summary: "Create a service", tags: ["Catalog"] },
});

export const updateService = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      categoryId: z.string().min(1).optional(),
      locationType: serviceLocationTypeSchema.optional(),
      imageKeys: z.array(z.string().max(300)).optional(),
      quoteForm: z
        .object({
          responseHours: z.number().int().min(1).max(720),
          askDeadline: z.boolean(),
          askPhotos: z.boolean(),
          askLocation: z.boolean(),
          intro: z.string().trim().max(400).nullable(),
        })
        .optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Update a service", tags: ["Catalog"] },
});

export const setServiceStatus = defineMutation({
  input: zodSchema(
    z.object({ serviceId: z.string().min(1), status: serviceStatusSchema }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Publish, unpublish or archive a service", tags: ["Catalog"] },
});

export const addServiceOption = defineMutation({
  input: zodSchema(optionShape.extend({ serviceId: z.string().min(1) })),
  output: zodSchema(z.object({ optionId: z.string().min(1) })),
  docs: { summary: "Add an option to a service", tags: ["Catalog"] },
});

export const updateServiceOption = defineMutation({
  input: zodSchema(
    optionShape.partial().extend({
      serviceId: z.string().min(1),
      optionId: z.string().min(1),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Update an option", tags: ["Catalog"] },
});

export const removeServiceOption = defineMutation({
  input: zodSchema(
    z.object({ serviceId: z.string().min(1), optionId: z.string().min(1) }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Remove an option", tags: ["Catalog"] },
});

export const reorderServiceOptions = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      orderedIds: z.array(z.string().min(1)).min(1).max(100),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Set the display order of a service's options", tags: ["Catalog"] },
});

export const setServiceTranslation = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      /** Present to translate an option's name; absent for the service's own. */
      optionId: z.string().min(1).optional(),
      locale: localeSchema,
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Write one language's copy for a service", tags: ["Catalog"] },
});

export const catalogWriteSchema = defineGraphQLSchema(
  {
    category: {
      create: createCategory,
      update: updateCategory,
      reorder: reorderCategories,
    },
    service: {
      create: createService,
      update: updateService,
      setStatus: setServiceStatus,
      options: {
        add: addServiceOption,
        update: updateServiceOption,
        remove: removeServiceOption,
        reorder: reorderServiceOptions,
      },
      translation: { set: setServiceTranslation },
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
