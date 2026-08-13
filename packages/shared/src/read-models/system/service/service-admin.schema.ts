import { z } from "zod";
import { LOCALES } from "../../../enums/system-enums";

export const serviceOptionOwnerReadModel = z.object({
  id: z.string().min(1),
  pricingMode: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  minMinutes: z.number().int().nullable(),
  stepMinutes: z.number().int().nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(z.object({ locale: z.enum(LOCALES), name: z.string() })),
});

/**
 * A service as its own provider sees it.
 *
 * Translations are deliberately unresolved. The provider's job on this screen
 * is to see which languages are filled in and which are not, and a resolved
 * name would hide exactly that — a service with no English would show its
 * Portuguese and look finished.
 */
export const serviceOwnerReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string(),
  categoryId: z.string(),
  categoryCode: z.string(),
  sourceLocale: z.enum(LOCALES),
  locationType: z.string(),
  bookingMode: z.string(),
  status: z.string(),
  imageUrls: z.array(z.string()),
  sortOrder: z.number().int(),
  /** `provider_member.id`s. Empty is a real state for a draft service; `canPublish` refuses it for a published one. */
  memberIds: z.array(z.string()),
  options: z.array(serviceOptionOwnerReadModel),
  translations: z.array(
    z.object({
      locale: z.enum(LOCALES),
      name: z.string(),
      description: z.string().nullable(),
    }),
  ),
  quoteForm: z
    .object({
      responseHours: z.number().int(),
      askDeadline: z.boolean(),
      askPhotos: z.boolean(),
      askLocation: z.boolean(),
      intro: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
});

export type ServiceOwnerDTO = z.infer<typeof serviceOwnerReadModel>;
