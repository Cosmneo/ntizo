import type { ProviderBookingPageDTO } from "@ntizo/shared/read-models";
import type {
  BookingReadRepositoryPort,
  ProviderListTab,
} from "../ports/outbound/booking-read.repository.port";
import { toProviderBookingDTO } from "./to-provider-booking-dto";

/** Hard ceiling, the wallet's. A list is read a page at a time. */
export const MAX_PROVIDER_PAGE = 50;

export interface ListProviderBookingsInput {
  providerId: string;
  tab: ProviderListTab;
  q: string | null;
  memberId: string | null;
  limit: number;
  offset: number;
  now: Date;
}

/**
 * One tab of the workspace's bookings, with the count behind it and the
 * members the list can be narrowed to. Three reads in one round trip because
 * the page draws all three at once, and the `limit + 1` trick is the wallet's:
 * "is there another page" is a length check, not a second query.
 */
export class ListProviderBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: ListProviderBookingsInput): Promise<ProviderBookingPageDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PROVIDER_PAGE);
    const offset = Math.max(input.offset, 0);
    const q = input.q?.trim() ? input.q.trim() : null;
    const filter = { tab: input.tab, q, memberId: input.memberId, now: input.now };

    const [rows, total, members] = await Promise.all([
      this.repo.listForProvider(input.providerId, filter, limit + 1, offset),
      this.repo.countForProvider(input.providerId, filter),
      this.repo.membersOf(input.providerId),
    ]);

    const hasMore = rows.length > limit;
    return {
      items: (hasMore ? rows.slice(0, limit) : rows).map(toProviderBookingDTO),
      total,
      nextOffset: hasMore ? offset + limit : null,
      members,
    };
  }
}
