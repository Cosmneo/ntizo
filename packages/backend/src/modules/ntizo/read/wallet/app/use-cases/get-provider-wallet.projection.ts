import type { WalletWithHistoryDTO } from "@ntizo/shared/read-models";
import type { WalletReadRepositoryPort } from "../ports/outbound/wallet-read.repository.port";

/** Hard ceiling. A ledger is read a page at a time, not exported from a screen. */
export const MAX_WALLET_PAGE = 50;

export interface GetProviderWalletInput {
  providerId: string;
  limit: number;
  offset: number;
}

/**
 * A workspace's balance and the entries behind it.
 *
 * Both in one read because they are one question — "how much do I have, and
 * why" — and two round trips would let the screen show a balance from one
 * moment beside a history from another.
 */
export class GetProviderWalletProjection {
  constructor(private readonly repo: WalletReadRepositoryPort) {}

  async execute(input: GetProviderWalletInput): Promise<WalletWithHistoryDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_WALLET_PAGE);
    const offset = Math.max(input.offset, 0);

    const [found, rows] = await Promise.all([
      this.repo.findByProvider(input.providerId),
      // One more than asked for, so "is there another page" is a length check
      // rather than a second query.
      this.repo.listEntries(input.providerId, limit + 1, offset),
    ]);

    const hasMore = rows.length > limit;
    return {
      // A workspace predating wallets has no row. Zeroes rather than an error:
      // the honest answer to "how much is in it" is none, and refusing to
      // render the page would punish the provider for when they signed up.
      wallet: found ?? { currency: "MZN", availableMinor: 0, pendingMinor: 0 },
      entries: hasMore ? rows.slice(0, limit) : rows,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
}
