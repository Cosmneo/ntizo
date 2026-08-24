import { desc, eq } from "drizzle-orm";
import type { WalletDTO, WalletEntryDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  wallet,
  walletEntry,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import type { WalletReadRepositoryPort } from "../../../app/ports/outbound/wallet-read.repository.port";

export class DrizzleWalletReadRepository implements WalletReadRepositoryPort {
  async findByProvider(providerId: string): Promise<WalletDTO | null> {
    const [row] = await getDb()
      .select({
        currency: wallet.currency,
        availableMinor: wallet.availableMinor,
        pendingMinor: wallet.pendingMinor,
      })
      .from(wallet)
      .where(eq(wallet.providerId, providerId))
      .limit(1);
    return row ?? null;
  }

  async listEntries(
    providerId: string,
    limit: number,
    offset: number,
  ): Promise<WalletEntryDTO[]> {
    const rows = await getDb()
      .select({
        id: walletEntry.id,
        type: walletEntry.type,
        amountMinor: walletEntry.amountMinor,
        availableDeltaMinor: walletEntry.availableDeltaMinor,
        pendingDeltaMinor: walletEntry.pendingDeltaMinor,
        balanceAfterMinor: walletEntry.balanceAfterMinor,
        currency: walletEntry.currency,
        description: walletEntry.description,
        bookingId: walletEntry.bookingId,
        createdAt: walletEntry.createdAt,
      })
      .from(walletEntry)
      .innerJoin(wallet, eq(wallet.id, walletEntry.walletId))
      .where(eq(wallet.providerId, providerId))
      // By time, then by id. Two entries written in the same millisecond are
      // possible, and an order that is not total makes paging repeat or skip
      // whichever of them the database returns second this time.
      .orderBy(desc(walletEntry.createdAt), desc(walletEntry.id))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}
