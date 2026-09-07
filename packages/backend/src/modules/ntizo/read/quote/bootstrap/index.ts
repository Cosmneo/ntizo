import { DrizzleQuoteReadRepository } from "../infra/repositories/drizzle/quote-read.repository";
import { ListMyQuotesProjection } from "../app/use-cases/list-my-quotes.projection";
import { GetMyQuoteProjection } from "../app/use-cases/get-my-quote.projection";
import { ListProviderQuotesProjection } from "../app/use-cases/list-provider-quotes.projection";
import { GetProviderQuoteProjection } from "../app/use-cases/get-provider-quote.projection";
import { GetProviderQuoteCountsProjection } from "../app/use-cases/get-provider-quote-counts.projection";
import { DrizzleProviderReadRepository } from "../../provider/infra/repositories/drizzle/provider-read.repository";

/**
 * A reader of its own, not a reuse of `DrizzleQuoteRepository` — the same
 * ruling `bootstrapBookingRead` makes, for the same reason.
 *
 * `DrizzleQuoteRepository` rebuilds a full `Quote` through `Quote.restore` on
 * every row, which re-runs every guard the write side needs immediately
 * before a command changes a quote — including the "at most one live
 * proposal" check. That work is exactly right there and pure cost against a
 * list nobody is about to mutate; worse, one snapshot that fails a check
 * throws and takes the whole page down rather than showing nineteen good
 * rows and one bad one.
 *
 * One repository behind all five projections, because all five read the same
 * `quote` rows through the same joins — what differs is the `WHERE`, the tab
 * and the mapper on the way out. Two readers is how the customer's page and
 * the workspace's page start disagreeing about what a quote says.
 */
export function bootstrapQuoteRead() {
  const repo = new DrizzleQuoteReadRepository();

  return {
    adapters: { repo },
    useCases: {
      listMine: new ListMyQuotesProjection(repo),
      getMine: new GetMyQuoteProjection(repo),
      listForProvider: new ListProviderQuotesProjection(repo),
      getForProvider: new GetProviderQuoteProjection(repo),
      countsForProvider: new GetProviderQuoteCountsProjection(repo),
      /**
       * Only `isMember` is used, and only to answer "may this person look" —
       * the wallet's and the booking read side's arrangement. It is what
       * `assertMayReadWorkspace` takes, which is why it is exposed here
       * rather than constructed in the handler.
       */
      providerRead: new DrizzleProviderReadRepository(),
    },
  };
}

export type QuoteReadBootstrap = ReturnType<typeof bootstrapQuoteRead>;
