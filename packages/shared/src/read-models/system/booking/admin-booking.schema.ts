import { z } from "zod";

/**
 * The three questions an administrator asks about bookings, and the only
 * three. This is not a bookings browser: a queue exists to be emptied, so it
 * shows what needs a hand and nothing else.
 */
export const ADMIN_BOOKING_TABS = ["unclosed", "in_window", "disputed"] as const;
export type AdminBookingTab = (typeof ADMIN_BOOKING_TABS)[number];

/** The statuses that can appear in that queue. Everything else is either not started or already finished. */
const ADMIN_VISIBLE_STATUSES = ["CONFIRMED", "MARKED_DONE", "DISPUTED"] as const;

/**
 * One row of the administrator's queue. It carries the workspace's name,
 * unlike the provider's own row, because an administrator is looking across
 * workspaces and "Ana, Corte de cabelo" names no one workspace.
 */
export const adminBookingReadModel = z.object({
  id: z.string().min(1),
  status: z.enum(ADMIN_VISIBLE_STATUSES),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  customerFirstName: z.string().min(1),
  serviceName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string().min(1),
  priceMinor: z.number().int().min(0),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),
  /** When the platform asked the provider to close it; null while it has not asked. */
  remindedAt: z.string().nullable(),
  markedDoneAt: z.string().nullable(),
  /** The next thing the clock will do, whatever that is in this status. */
  expiresAt: z.string().nullable(),
  /** The dispute's thread, so a row can link straight into it. Null unless disputed. */
  threadId: z.string().nullable(),
});

export const adminBookingPageReadModel = z.object({
  items: z.array(adminBookingReadModel),
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
});

export type AdminBookingDTO = z.infer<typeof adminBookingReadModel>;
export type AdminBookingPageDTO = z.infer<typeof adminBookingPageReadModel>;
