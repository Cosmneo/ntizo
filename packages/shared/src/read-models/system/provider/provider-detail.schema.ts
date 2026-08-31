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
  /**
   * The platform's cut of this workspace's bookings, in basis points — 1200
   * is 12%. Raw, not a formatted percentage: formatting is the view's job,
   * and a number that arrives pre-formatted cannot be localised.
   *
   * The first commercially sensitive field on this model. Everything else
   * here — name, members, invites — is descriptive; this one tells a
   * provider what the platform takes out of every payout, and it reaches
   * this model only through `provider.byId`, which is membership-guarded.
   *
   * Readable by every member, `staff` included — deliberately, not by
   * oversight. `Provider.assertCanManage` (the domain aggregate) excludes
   * `staff` from every write in this bounded context: a staff member can
   * rename nothing, move nothing, change no payout destination. This field
   * does not follow that line, because it isn't a management action being
   * exposed — it's a fact about the business, the same category as its name
   * or its address, and someone who works there may know what the business
   * is charged even though they may not change it.
   */
  commissionBps: z.number().int(),
  ownerUserId: z.string().min(1),
  members: z.array(providerMemberReadModel),
  invites: z.array(providerInviteReadModel),
});

export type ProviderDocumentDTO = z.infer<typeof providerDocumentReadModel>;
export type ProviderImageDTO = z.infer<typeof providerImageReadModel>;
export type ProviderMemberDTO = z.infer<typeof providerMemberReadModel>;
export type ProviderInviteDTO = z.infer<typeof providerInviteReadModel>;
export type ProviderDetailDTO = z.infer<typeof providerDetailReadModel>;

/**
 * What the accept-invite page may show before anyone is signed in.
 *
 * Holding the token is the credential — it was mailed to the invitee and to
 * nobody else — so this is deliberately readable without a session: the page
 * has to say *what* is being joined before asking someone to create an account
 * for it, or the sign-up is a leap of faith.
 *
 * Nothing here that the invitation email did not already contain. The email
 * carries the workspace, the inviter and the role; repeating them costs
 * nothing and withholding them would only make the page useless.
 */
export const providerInvitePublicReadModel = z.object({
  providerName: z.string(),
  inviterName: z.string(),
  role: z.enum(["admin", "staff"]),
  /** Who it was sent to, so the page can spot a mismatched session. */
  email: z.string(),
  /** `pending` | `accepted` | `revoked` | `declined` | `expired`. */
  status: z.string(),
  expiresAt: z.string(),
});

export type ProviderInvitePublicDTO = z.infer<typeof providerInvitePublicReadModel>;
