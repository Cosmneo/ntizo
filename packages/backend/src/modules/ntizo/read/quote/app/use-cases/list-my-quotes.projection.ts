import type { CustomerQuotePageDTO } from "@ntizo/shared/read-models";
import type { CustomerQuoteTab } from "@ntizo/shared";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";
import { toCustomerQuoteDTO } from "./to-customer-quote-dto";

/** Hard ceiling, the wallet's and the booking list's. A list is read a page at a time. */
export const MAX_QUOTE_PAGE = 50;

export interface ListMyQuotesInput {
  /** Stamped by the handler from the session, never read from `args`. */
  customerId: string;
  tab: CustomerQuoteTab;
  limit: number;
  offset: number;
}

/**
 * One tab of a customer's own quotes, with the two counts the chips render.
 *
 * Takes no reader-supplied customer id: `customerId` is stamped by the
 * GraphQL handler from the session and handed to the repository as *part of
 * the query*, exactly as `ListMyBookingsProjection`'s is. A query that took
 * the id as an argument would be the endpoint that reads anybody's quotes.
 *
 * `hasMore` is the `limit + 1` probe the wallet, the booking list and the
 * administrator's queue all use — "is there another page" is a length check,
 * not a second `COUNT(*)` that can disagree with the page above it.
 *
 * Two rounds rather than one, because the second depends on the first: which
 * quotes are on this page has to be known before their proposals and files
 * can be fetched. The counts ride along with the page in the first round —
 * they are a question about the whole tab, not about these rows.
 */
export class ListMyQuotesProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: ListMyQuotesInput): Promise<CustomerQuotePageDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_QUOTE_PAGE);
    const offset = Math.max(input.offset, 0);

    const [probed, counts] = await Promise.all([
      this.repo.listForCustomer(input.customerId, input.tab, limit + 1, offset),
      this.repo.countsForCustomer(input.customerId),
    ]);

    const hasMore = probed.length > limit;
    // The probe row is dropped before anything else reads this page — it was
    // fetched to answer a boolean, not to be shown.
    const rows = hasMore ? probed.slice(0, limit) : probed;
    const ids = rows.map((r) => r.id);
    const [proposals, attachments] = await Promise.all([
      this.repo.proposalsFor(ids),
      this.repo.attachmentsFor(ids),
    ]);

    return {
      items: rows.map((row) =>
        toCustomerQuoteDTO(row, proposals.get(row.id) ?? [], attachments.get(row.id) ?? []),
      ),
      counts,
      hasMore,
    };
  }
}
