import type { Quote } from "../../../domain/aggregates/quote.aggregate";

export interface QuoteRepositoryPort {
  /**
   * Writes the quote row and any proposal rows. Throws `QuoteAlreadyOpenError`
   * when `quote_open_per_customer_service_uq` refuses. Returns the quote with ids.
   */
  insert(quote: Quote): Promise<Quote>;

  findById(id: string): Promise<Quote | null>;

  /**
   * Compare-and-swap: updates the row only while its status is still
   * `expectedStatus`; inserts proposals whose id is null and stamps
   * supersession on the rest. Returns the persisted quote (ids assigned) or
   * null when the row had moved on.
   */
  save(quote: Quote, expectedStatus: Quote["status"]): Promise<Quote | null>;

  /** Open quotes whose clock has run out, oldest deadline first. */
  findDueForSweep(now: Date, limit: number): Promise<Quote[]>;
}
