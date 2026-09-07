import type { ProviderQuotePageDTO } from "@ntizo/shared/read-models";
import type { ProviderQuoteTab } from "@ntizo/shared";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";
import { toProviderQuoteDTO } from "./to-provider-quote-dto";
import { MAX_QUOTE_PAGE } from "./list-my-quotes.projection";

export interface ListProviderQuotesInput {
  providerId: string;
  tab: ProviderQuoteTab;
  limit: number;
  offset: number;
}

/**
 * One tab of the workspace's quotes, with the three counts the chips render.
 *
 * The customer's list's twin — same clamp, same `limit + 1` probe, same two
 * rounds — differing only in which mapper it hands the rows to, and that is
 * the whole of the difference between what the two audiences see. See
 * `to-provider-quote-dto.ts` for what that mapper leaves behind and why.
 *
 * Takes a `providerId` and performs no check on it: a person may belong to
 * several workspaces and the shell knows which one is active, so the id is
 * explicit here as it is on the wallet's and the booking list's reads. Who
 * may ask is decided at the handler by `assertMayReadWorkspace`, and the
 * repository puts the same id inside its `WHERE` besides.
 */
export class ListProviderQuotesProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: ListProviderQuotesInput): Promise<ProviderQuotePageDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_QUOTE_PAGE);
    const offset = Math.max(input.offset, 0);

    const [probed, counts] = await Promise.all([
      this.repo.listForProvider(input.providerId, input.tab, limit + 1, offset),
      this.repo.countsForProvider(input.providerId),
    ]);

    const hasMore = probed.length > limit;
    const rows = hasMore ? probed.slice(0, limit) : probed;
    const ids = rows.map((r) => r.id);
    const [proposals, attachments] = await Promise.all([
      this.repo.proposalsFor(ids),
      this.repo.attachmentsFor(ids),
    ]);

    return {
      items: rows.map((row) =>
        toProviderQuoteDTO(row, proposals.get(row.id) ?? [], attachments.get(row.id) ?? []),
      ),
      counts,
      hasMore,
    };
  }
}
