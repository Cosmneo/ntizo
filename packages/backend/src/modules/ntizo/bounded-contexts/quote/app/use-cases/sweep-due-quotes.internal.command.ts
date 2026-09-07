import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { SweepQuoteCommand } from "./sweep-quote.command";

export interface SweepDueQuotesInternalInput {
  /** The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The cron's one question — which quotes are past their own deadline — and
 * one settlement per answer. Mirrors `SweepDueBookingsInternalCommand`
 * deliberately: this is not the first sweep in this codebase and should not
 * invent a second convention.
 *
 * One bad row does not stop the batch: each quote is settled inside its own
 * `try`, a failure is counted and logged with its id, and the row is left
 * exactly as it was found so the next sweep picks it up again.
 */
export class SweepDueQuotesInternalCommand {
  constructor(
    private readonly quotes: QuoteRepositoryPort,
    private readonly sweepQuote: SweepQuoteCommand,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SweepDueQuotesInternalInput): Promise<{ swept: number; failed: number }> {
    const due = await this.quotes.findDueForSweep(this.now(), input.limit);
    let swept = 0;
    let failed = 0;
    for (const quote of due) {
      try {
        await this.sweepQuote.execute({ quoteId: quote.id as string });
        swept++;
      } catch (error) {
        failed++;
        console.error("[quote] could not settle a due quote", {
          quoteId: quote.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { swept, failed };
  }
}
