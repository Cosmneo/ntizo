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
