import type { ProviderQuoteDetailDTO } from "@ntizo/shared/read-models";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";
import { toProviderQuoteDetailDTO } from "./to-provider-quote-dto";

export interface GetProviderQuoteInput {
  providerId: string;
  quoteId: string;
}

/**
 * One of the workspace's quotes, by id — the page a provider prices a job on.
 *
 * `providerId` goes into the repository's `WHERE` alongside the quote's own
 * id, so "this quote belongs to another workspace" and "there is no such
 * quote" are the same answer and an id cannot be probed. The handler has
 * already refused a caller who does not belong to this workspace; this is the
 * second half, and it is the half that survives a handler being rewritten.
 *
 * Four reads once the quote is known to be the workspace's: its proposals,
 * its files, the two facts the proposal form needs, and how many bookings
 * this customer has finished. None of them runs for a quote that is not
 * theirs.
 */
export class GetProviderQuoteProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: GetProviderQuoteInput): Promise<ProviderQuoteDetailDTO | null> {
    const row = await this.repo.findForProvider(input.quoteId, input.providerId);
    if (!row) return null;

    const [proposals, attachments, facts, completed] = await Promise.all([
      this.repo.proposalsFor([row.id]),
      this.repo.attachmentsFor([row.id]),
      this.repo.providerFormFacts(input.providerId, row.serviceId),
      this.repo.completedBookingsFor(row.customerId),
    ]);

    return toProviderQuoteDetailDTO(
      row,
      proposals.get(row.id) ?? [],
      attachments.get(row.id) ?? [],
      facts,
      completed,
    );
  }
}
