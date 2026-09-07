import { z } from "zod";
import { STATS_WINDOW_DAYS, providerBookingStatsDayReadModel } from "./provider-booking.schema";

/**
 * The platform's numbers, in one read — the mirror image of
 * `providerBookingStatsReadModel`. That one shows a workspace its own share;
 * this one shows the platform what was booked in full and what it kept.
 *
 * Same window (`STATS_WINDOW_DAYS`), same per-day series, same clock on the
 * money (`COMPLETED`, by `completed_at`), so the platform's figure and the sum
 * of its providers' figures describe the same bookings. `disputed` is the one
 * count with no window: a dispute is owed a decision whenever it was opened.
 */
export const adminBookingStatsReadModel = z.object({
  /** `DISPUTED`, any date — what the administrator has to decide. */
  disputed: z.number().int().min(0),
  /** Paid inside the window, whatever happened to them since. Equals the sum of `perDay[].confirmed`. */
  confirmedLast30: z.number().int().min(0),
  completedLast30: z.number().int().min(0),
  /** Σ `price_minor` over `COMPLETED` inside the window: what customers paid. */
  grossLast30Minor: z.number().int().min(0),
  /** Σ `commission_minor` over the same bookings: what the platform kept. */
  commissionLast30Minor: z.number().int().min(0),
  /** Workspaces created inside the window, whatever their status now. */
  newProvidersLast30: z.number().int().min(0),
  currency: z.string().min(1),
  /** Oldest first, zero-filled, always `STATS_WINDOW_DAYS` long. Platform-wide. */
  perDay: z.array(providerBookingStatsDayReadModel).length(STATS_WINDOW_DAYS),
});

export type AdminBookingStatsDTO = z.infer<typeof adminBookingStatsReadModel>;
