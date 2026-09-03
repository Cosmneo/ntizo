import type { ProviderBookingDetailDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { toProviderBookingDetailDTO } from "./to-provider-booking-dto";

export class GetProviderBookingProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: {
    providerId: string;
    bookingId: string;
    now: Date;
  }): Promise<ProviderBookingDetailDTO | null> {
    const row = await this.repo.findForProvider(input.bookingId, input.providerId);
    if (!row) return null;
    const changes = await this.repo.timelineFor(row.id);
    return toProviderBookingDetailDTO(row, changes, input.now);
  }
}
