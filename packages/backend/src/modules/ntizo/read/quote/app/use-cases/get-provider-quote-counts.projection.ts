import type { ProviderQuoteCountsDTO } from "@ntizo/shared/read-models";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";

/**
 * The badge on the workspace shell's Orçamentos entry: how many requests are
 * waiting for an answer, and nothing else.
 *
 * Its own field rather than a read of `quote.forProvider` with `limit: 1`,
 * because the shell draws this badge on every screen and has no page of
 * quotes to hang it off. `providerQuoteCountsReadModel` is one integer for
 * the same reason — the other two counts belong to the list that shows the
 * tabs they label, and a badge that shipped all three would go stale on every
 * screen that never renders them.
 *
 * The repository still answers all three in one grouped read, so this is one
 * round trip either way and the badge cannot disagree with the tab it links
 * to.
 */
export class GetProviderQuoteCountsProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: { providerId: string }): Promise<ProviderQuoteCountsDTO> {
    const counts = await this.repo.countsForProvider(input.providerId);
    return { toAnswer: counts.toAnswer };
  }
}
