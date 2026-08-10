import { z } from "zod";

/**
 * A saved address as the owner sees it.
 *
 * Only ever returned to the person it belongs to, so it carries the full
 * detail — unlike the provider's public address, which is deliberately
 * truncated to city and district.
 */
export const addressReadModel = z.object({
  id: z.string().min(1),
  label: z.string(),
  country: z.string().length(2),
  city: z.string(),
  district: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string().nullable(),
  directions: z.string().nullable(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  isDefault: z.boolean(),
});

export type AddressDTO = z.infer<typeof addressReadModel>;
