import { z } from "zod";
import { providerListItemRole, providerListItemType } from "./provider-list-item.schema";

export const providerMemberReadModel = z.object({
  userId: z.string().min(1),
  email: z.string(),
  name: z.string().nullable(),
  role: providerListItemRole,
  joinedAt: z.string(),
});

export const providerInviteReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(["admin", "staff"]),
  status: z.string(),
});

/** Read model returned by the `provider.byId` query. */
export const providerDetailReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.string(),
  description: z.string().nullable(),
  ownerUserId: z.string().min(1),
  members: z.array(providerMemberReadModel),
  invites: z.array(providerInviteReadModel),
});

export type ProviderMemberDTO = z.infer<typeof providerMemberReadModel>;
export type ProviderInviteDTO = z.infer<typeof providerInviteReadModel>;
export type ProviderDetailDTO = z.infer<typeof providerDetailReadModel>;
