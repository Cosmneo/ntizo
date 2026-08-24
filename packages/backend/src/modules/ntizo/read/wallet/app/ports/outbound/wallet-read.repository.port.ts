import type { WalletDTO, WalletEntryDTO } from "@ntizo/shared/read-models";

export interface WalletReadRepositoryPort {
  /**
   * Null where the workspace has no wallet row.
   *
   * Every provider created since wallets existed has one, and older ones do
   * not. Null rather than a zeroed wallet, because "nothing has ever been
   * recorded here" and "the balance is zero" are different facts and the
   * screen should be able to tell them apart.
   */
  findByProvider(providerId: string): Promise<WalletDTO | null>;
  /** Newest first — a ledger is read from the most recent thing that happened. */
  listEntries(
    providerId: string,
    limit: number,
    offset: number,
  ): Promise<WalletEntryDTO[]>;
}
