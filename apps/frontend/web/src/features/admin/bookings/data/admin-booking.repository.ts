import { queryOptions } from "@tanstack/react-query";
import type { AdminBookingDTO, AdminBookingTab } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

/**
 * The eleven fields the queue draws, of the seventeen the row carries.
 *
 * A `Pick` of the published read model rather than a shape of this app's own:
 * every name here is the contract's, so a field that is renamed on the wire
 * stops type-checking here instead of arriving as `undefined`. The six left
 * out — `priceMinor`, the two commission columns, `currency`, `remindedAt`
 * and `expiresAt` — are not asked for because nothing on this screen shows
 * them, and a document that asks for what it does not draw is a column the
 * next reader has to go looking for a consumer of.
 */
export type AdminBookingRowDTO = Pick<
  AdminBookingDTO,
  | "id"
  | "status"
  | "providerId"
  | "providerName"
  | "customerFirstName"
  | "serviceName"
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "markedDoneAt"
  | "threadId"
>;

export interface AdminBookingQueuePage {
  items: AdminBookingRowDTO[];
  total: number;
  nextOffset: number | null;
}

/**
 * The field's own input type name, verified against the generated SDL rather
 * than guessed from the flattening rule:
 * `bookingNeedsAttentionForAdmin(input: BookingNeedsAttentionForAdminInput!)`.
 *
 * `tab` renders as `String!` there, not as an enum — the kit's behaviour, the
 * same as `bookingForProvider`'s own `tab`. It is nonetheless enum-validated
 * at runtime by the field's zod input, so the values sent here come from
 * `ADMIN_BOOKING_TABS` rather than from the generated type, which would
 * happily accept any string.
 */
const PAGE = `
  query BookingNeedsAttentionForAdmin($input: BookingNeedsAttentionForAdminInput!) {
    bookingNeedsAttentionForAdmin(input: $input) {
      items {
        id status providerId providerName customerFirstName serviceName
        startsAt endsAt timezone markedDoneAt threadId
      }
      total nextOffset
    }
  }`;

/**
 * The three doors an administrator has into a booking, all three of them
 * guarded by `requireAdmin` on the handler and by nothing on this side.
 *
 * **Every one of them answers `{ bookingId }` whether or not it moved
 * anything.** `MarkBookingDoneCommand` answers `null` when its
 * compare-and-swap loses to the platform's own sweep, `CompleteBookingCommand`
 * returns the same way, and all three handlers `return { bookingId:
 * args.input.bookingId }` regardless — an echo of the request, not evidence of
 * a transition. Nothing here can tell a win from a loss; the read that follows
 * can, which is why the hooks that call these invalidate rather than writing
 * an answer into the cache.
 */
const ADMIN_MARK_DONE = `
  mutation BookingAdminMarkDone($input: BookingAdminMarkDoneInput!) {
    bookingAdminMarkDone(input: $input) { bookingId }
  }`;

const ADMIN_COMPLETE = `
  mutation BookingAdminComplete($input: BookingAdminCompleteInput!) {
    bookingAdminComplete(input: $input) { bookingId }
  }`;

const RESOLVE_DISPUTE = `
  mutation BookingResolveDispute($input: BookingResolveDisputeInput!) {
    bookingResolveDispute(input: $input) { bookingId }
  }`;

/** Rows a page of the queue holds. The field's own default, and well under its cap of 50. */
export const ADMIN_BOOKINGS_PAGE_SIZE = 20;

export interface AdminBookingsPageInput {
  tab: AdminBookingTab;
  offset: number;
}

export const adminBookingQueries = {
  /**
   * One tab, one page. The whole input is the key: a tab is a different
   * result set, not the same one filtered, and an offset is a different page
   * of it — so `invalidateQueries({ queryKey: ["admin", "bookings"] })` drops
   * every tab and every page at once, which is what a write that can move a
   * row *between* tabs requires.
   */
  page: (input: AdminBookingsPageInput) =>
    queryOptions({
      queryKey: ["admin", "bookings", input.tab, input.offset] as const,
      queryFn: async (): Promise<AdminBookingQueuePage> => {
        const d = await sessionGraphql<{ bookingNeedsAttentionForAdmin: AdminBookingQueuePage }>(PAGE, {
          input: {
            tab: input.tab,
            limit: ADMIN_BOOKINGS_PAGE_SIZE,
            offset: input.offset,
          },
        });
        return d.bookingNeedsAttentionForAdmin;
      },
    }),
};

/** Close a booking the provider left open. */
export async function adminMarkBookingDone(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingAdminMarkDone: { bookingId: string } }>(ADMIN_MARK_DONE, {
    input: { bookingId },
  });
}

/** End a customer's window early, for a booking nobody is going to answer. */
export async function adminCompleteBooking(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingAdminComplete: { bookingId: string } }>(ADMIN_COMPLETE, {
    input: { bookingId },
  });
}

/**
 * Decide a dispute: `upheld` sides with the customer and cancels, `false`
 * lets the completion stand.
 *
 * `note` is deliberately not sent. The field declares it `String` — nullable,
 * so an omitted key is the same fact as an explicit null — and what the
 * administrator wants both sides told is written on the dispute's own thread,
 * which is where this screen sends them. A second, unrecorded copy typed into
 * a queue row would be a message nobody can find again.
 */
export async function resolveBookingDispute(bookingId: string, upheld: boolean): Promise<void> {
  await sessionGraphql<{ bookingResolveDispute: { bookingId: string } }>(RESOLVE_DISPUTE, {
    input: { bookingId, upheld },
  });
}
