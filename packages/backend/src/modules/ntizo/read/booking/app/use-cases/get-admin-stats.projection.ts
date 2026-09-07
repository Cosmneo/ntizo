import type { AdminBookingStatsDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { DEFAULT_CURRENCY, fillDays } from "./get-provider-stats.projection";

/**
 * The administrator's one read — one repository call, for the reason the
 * provider's projection gives: a dashboard fetched a card at a time shows
 * the platform mid-blink. The day-filling is the provider's own, because
 * the platform's chart is the same thirty buckets.
 */
export class GetAdminStatsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { now: Date }): Promise<AdminBookingStatsDTO> {
    const { totals, perDay } = await this.repo.statsForAdmin(input.now);
    return {
      disputed: totals.disputed,
      confirmedLast30: totals.confirmedLast30,
      completedLast30: totals.completedLast30,
      grossLast30Minor: totals.grossLast30Minor,
      commissionLast30Minor: totals.commissionLast30Minor,
      newProvidersLast30: totals.newProvidersLast30,
      currency: totals.currency ?? DEFAULT_CURRENCY,
      perDay: fillDays(totals.today, perDay),
    };
  }
}
