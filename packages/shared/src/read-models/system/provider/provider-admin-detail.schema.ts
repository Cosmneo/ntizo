import { z } from "zod";
import { PROVIDER_STATUSES } from "../../../enums/provider-enums/provider-status.enum";

/**
 * One business, as the administrator deciding about it sees it.
 *
 * Wider than the queue row and narrower than the workspace's own detail: what
 * an admin needs is who this is, whether it may trade, what it is charged, and
 * what money is sitting against it. Not its availability or its bookings —
 * those are the provider's business and none of them change the decision.
 */
/**
 * A file the provider uploaded, as the reviewer sees it.
 *
 * The storage key is deliberately absent. The reviewer needs to *open* the
 * document, and the route that serves it takes the document's id and checks
 * who is asking — handing out bucket keys would put the object's address in
 * every browser that renders this list.
 */
export const providerDocumentReviewReadModel = z.object({
  id: z.string().min(1),
  type: z.string(),
  status: z.string(),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  uploadedAt: z.string(),
  reviewedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  /** Set when this upload replaced an earlier one — the swap-after-approval case. */
  supersedesId: z.string().nullable(),
});

export const providerAdminDetailReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  commissionBps: z.number().int(),
  ownerUserId: z.string(),
  ownerName: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  /**
   * The owner's phone, from their profile.
   *
   * There is no business phone: the `provider` table has never had one, and
   * inventing a column so this screen could show a field would be answering a
   * question nobody has asked with data nobody has entered. The person who
   * registered the business is who an admin needs to reach.
   */
  ownerPhone: z.string().nullable(),
  memberCount: z.number().int(),
  logoUrl: z.string().nullable(),
  photoUrls: z.array(z.string()),
  /** The full address as entered, not the one line the queue shows. */
  addressStreet: z.string().nullable(),
  addressDistrict: z.string().nullable(),
  addressPostalCode: z.string().nullable(),
  /**
   * Every document, newest first, superseded ones included.
   *
   * Superseded rows are kept in the list on purpose: the reason this table is
   * append-only is that somebody could otherwise swap an approved ID for a
   * forged one after the fact, and a reviewer who cannot see that a document
   * was replaced has no way to notice it happened.
   */
  documents: z.array(providerDocumentReviewReadModel),
  /**
   * Set when an approved document was replaced and the account needs looking
   * at again. The single most important thing on this screen.
   */
  reverificationRequestedAt: z.string().nullable(),
  /**
   * The statuses this one may legally move to, resolved on the server.
   *
   * Sent rather than derived in the browser so the screen and the aggregate
   * cannot disagree about what is offered — a button the server then refuses
   * is worse than no button.
   */
  allowedTransitions: z.array(z.enum(PROVIDER_STATUSES as [string, ...string[]])),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProviderAdminDetailDTO = z.infer<typeof providerAdminDetailReadModel>;
