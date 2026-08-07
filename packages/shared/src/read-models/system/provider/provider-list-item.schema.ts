import { z } from "zod";

export const providerListItemType = z.enum(["individual", "organization"]);
export const providerListItemRole = z.enum(["owner", "admin", "staff"]);

/** Read model returned by the `provider.mine` query — viewer-scoped. */
export const providerListItemReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.string(),
  role: providerListItemRole,
});

export type ProviderListItemType = z.infer<typeof providerListItemType>;
export type ProviderListItemRole = z.infer<typeof providerListItemRole>;
export type ProviderListItemDTO = z.infer<typeof providerListItemReadModel>;
