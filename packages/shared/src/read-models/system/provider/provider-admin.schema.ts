import { z } from "zod";
import { PROVIDER_STATUSES } from "../../../enums";
import { providerListItemType } from "./provider-list-item.schema";

/**
 * A provider as the review queue sees it.
 *
 * Wider than the member-scoped list item and narrower than the detail: an
 * admin deciding on an application needs what the business claims to be, who
 * owns it and when it applied — and nothing about its bookings, which are not
 * what the decision turns on.
 *
 * The status is the enum, not a bare string. The member-scoped model still
 * carries `z.string()` there, which is how a typo in a status filter could
 * silently return nothing rather than fail; that one is worth tightening the
 * next time it is touched.
 */
export const providerAdminReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.enum(PROVIDER_STATUSES as [string, ...string[]]),
  description: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  /** Who applied. An admin refusing a business needs to know whose it is. */
  ownerEmail: z.string().nullable(),
  /**
   * The customer-side fee on this provider's bookings, in basis points.
   *
   * Here because it is the one number on this screen an administrator changes,
   * and showing the list without it would mean opening each provider to find
   * out which ones are on a non-standard rate.
   */
  commissionBps: z.number().int(),
  /** ISO 8601. How long the application has been waiting is half the queue's job. */
  createdAt: z.string(),
});

export type ProviderAdminDTO = z.infer<typeof providerAdminReadModel>;
