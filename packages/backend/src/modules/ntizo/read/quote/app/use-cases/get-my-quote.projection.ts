import type { CustomerQuoteDetailDTO } from "@ntizo/shared/read-models";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";
import { toCustomerQuoteDetailDTO } from "./to-customer-quote-dto";

export interface GetMyQuoteInput {
  /** Stamped by the handler from the session, never read from `args`. */
  customerId: string;
  quoteId: string;
}

/**
 * One of the caller's own quotes, by id.
 *
 * `customerId` is handed to the repository as *part of the query* rather than
 * checked against the row afterward — see
 * `QuoteReadRepositoryPort.findForCustomer`, and
 * `BookingReadRepositoryPort.findForCustomer` for the fuller argument for why
 * that distinction is the point of the method rather than an implementation
 * detail of it.
 *
 * `null` for a quote that does not exist and for one belonging to somebody
 * else alike, and it is not this layer's job to tell them apart: the
 * repository already declines to.
 *
 * The proposals and the files are read only once the first read has confirmed
 * the quote is the caller's. There is nothing to fetch and discard for a
 * quote that is not theirs.
 */
export class GetMyQuoteProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: GetMyQuoteInput): Promise<CustomerQuoteDetailDTO | null> {
    const row = await this.repo.findForCustomer(input.quoteId, input.customerId);
    if (!row) return null;

    const [proposals, attachments] = await Promise.all([
      this.repo.proposalsFor([row.id]),
      this.repo.attachmentsFor([row.id]),
    ]);

    return toCustomerQuoteDetailDTO(
      row,
      proposals.get(row.id) ?? [],
      attachments.get(row.id) ?? [],
    );
  }
}
