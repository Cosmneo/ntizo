import type { AdminBookingDTO, AdminBookingPageDTO, AdminBookingTab } from "@ntizo/shared/read-models";
import type {
  AdminBookingRow,
  BookingReadRepositoryPort,
} from "../ports/outbound/booking-read.repository.port";
import { toProviderBookingDTO } from "./to-provider-booking-dto";

/** Hard ceiling, the same one `ListProviderBookingsProjection` keeps. A queue is read a page at a time. */
export const MAX_ADMIN_PAGE = 50;

export interface ListAdminBookingsInput {
  tab: AdminBookingTab;
  limit: number;
  offset: number;
  /** The edge's instant, handed down so `unclosed` means something a test can state. */
  now: Date;
}

/**
 * One tab of the administrator's queue, with the count behind it.
 *
 * Two reads rather than the provider list's three: there is no member filter
 * to name, because this list spans every workspace. The `limit + 1` trick is
 * the same wallet's — "is there another page" is a length check, not a second
 * query — and the extra row is dropped rather than shown, which is what keeps
 * a page from repeating the row the next page opens with.
 *
 * **No reveal rule.** `toProviderBookingDetailDTO` hides the customer's phone,
 * email and street from a provider who has not been paid; nothing is hidden
 * here, because `adminBookingReadModel` carries none of those columns in the
 * first place — an administrator gets the whole of the row it does carry, and
 * the row deliberately does not carry contact details a queue has no use for.
 * What stands between this and an unauthorised reader is the `requireAdmin`
 * at the edge; see `BookingReadRepositoryPort.listForAdmin`.
 */
export class ListAdminBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: ListAdminBookingsInput): Promise<AdminBookingPageDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_ADMIN_PAGE);
    const offset = Math.max(input.offset, 0);
    const filter = { tab: input.tab, now: input.now };

    const [rows, total] = await Promise.all([
      this.repo.listForAdmin(filter, limit + 1, offset),
      this.repo.countForAdmin(filter),
    ]);

    const hasMore = rows.length > limit;
    return {
      items: (hasMore ? rows.slice(0, limit) : rows).map(toAdminBookingDTO),
      total,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
}

/**
 * One queue row on the wire.
 *
 * The eleven fields the administrator's row shares with the provider's are
 * taken from `toProviderBookingDTO` rather than mapped a second time — a
 * blank customer name becoming "Cliente", and every instant becoming an ISO
 * string, are rules that must not have two implementations that can disagree.
 * The five that are the administrator's own are mapped here.
 */
export function toAdminBookingDTO(row: AdminBookingRow): AdminBookingDTO {
  const shared = toProviderBookingDTO(row);
  return {
    id: shared.id,
    // The three statuses `adminWhere` can select are exactly
    // `ADMIN_VISIBLE_STATUSES`, which is the enum the read model parses this
    // against — so a WHERE that ever widened would fail loudly at the field's
    // own output schema rather than quietly here.
    status: shared.status as AdminBookingDTO["status"],
    providerId: row.providerId,
    providerName: row.providerName,
    customerFirstName: shared.customerFirstName,
    serviceName: shared.serviceName,
    startsAt: shared.startsAt,
    endsAt: shared.endsAt,
    timezone: shared.timezone,
    priceMinor: shared.priceMinor,
    commissionBps: shared.commissionBps,
    commissionMinor: shared.commissionMinor,
    currency: shared.currency,
    remindedAt: row.remindedAt?.toISOString() ?? null,
    markedDoneAt: row.markedDoneAt?.toISOString() ?? null,
    // Whichever clock this status stands on — `expiresAt` carries five
    // different deadlines and is null under `DISPUTED`, where nobody is
    // waiting on one. See `bookingReadModel.expiresAt`.
    expiresAt: row.expiresAt?.toISOString() ?? null,
    threadId: row.threadId,
  };
}
