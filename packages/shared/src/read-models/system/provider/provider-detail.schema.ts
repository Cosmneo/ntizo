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

export const providerImageReadModel = z.object({
  /** What is stored and what gets saved back. */
  key: z.string().min(1),
  /** Where to show it from, or null when nothing serves this bucket publicly. */
  url: z.string().nullable(),
});

export const providerDocumentReadModel = z.object({
  id: z.string().min(1),
  /** A `ProviderDocumentType`. */
  type: z.string(),
  /** A `ProviderDocumentStatus` — never `superseded`, which the query excludes. */
  status: z.string(),
  fileName: z.string().nullable(),
  uploadedAt: z.string(),
  reviewedAt: z.string().nullable(),
  /** Shown to the provider, so it has to say something they can act on. */
  rejectionReason: z.string().nullable(),
});

/** Read model returned by the `provider.byId` query. */
export const providerDetailReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.string(),
  description: z.string().nullable(),
  /**
   * Where the business is.
   *
   * Absent until now, which is why the settings page could not populate its
   * address block: there was nothing to populate it from. Every part is
   * nullable because a provider who only works at the customer's home has no
   * premises to describe.
   */
  address: z
    .object({
      street: z.string().nullable(),
      city: z.string().nullable(),
      district: z.string().nullable(),
      country: z.string().nullable(),
      postalCode: z.string().nullable(),
    })
    .nullable(),
  /**
   * Images, each as the pair the caller actually needs.
   *
   * Not two parallel arrays of keys and URLs. `url` is null wherever no public
   * base is configured, so a `photoUrls` array that dropped its nulls would no
   * longer line up with `photoKeys` — and the settings form, which displays
   * the URL but saves the key, would attach the wrong image to the wrong slot.
   * Pairing them in one object makes that class of bug unrepresentable.
   */
  logo: providerImageReadModel.nullable(),
  photos: z.array(providerImageReadModel),
  /**
   * Compliance documents, one per type, newest first.
   *
   * Here rather than only in the wizard because the wizard is skippable, and
   * anything skipped there has to be finishable somewhere. It is also where a
   * rejection has to surface: a document refused two weeks after signup has no
   * other screen to appear on.
   */
  documents: z.array(providerDocumentReadModel),
  /**
   * Set when a document that had already been accepted was replaced.
   *
   * Surfaced to the provider deliberately: it explains why their standing
   * changed, and it means a swap is never silent on either side of the screen.
   */
  reverificationRequestedAt: z.string().nullable(),
  ownerUserId: z.string().min(1),
  members: z.array(providerMemberReadModel),
  invites: z.array(providerInviteReadModel),
});

export type ProviderDocumentDTO = z.infer<typeof providerDocumentReadModel>;
export type ProviderImageDTO = z.infer<typeof providerImageReadModel>;
export type ProviderMemberDTO = z.infer<typeof providerMemberReadModel>;
export type ProviderInviteDTO = z.infer<typeof providerInviteReadModel>;
export type ProviderDetailDTO = z.infer<typeof providerDetailReadModel>;
