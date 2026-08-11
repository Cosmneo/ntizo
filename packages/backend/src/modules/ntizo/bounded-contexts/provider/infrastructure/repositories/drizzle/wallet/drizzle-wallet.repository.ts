import { getDb } from "../../../../../../../better-auth/infrastructure/client/drizzle";
import { wallet } from "../../../../../../shared/infrastructure/database/provider/schemas";
import type { WalletRepositoryPort } from "../../../../app/ports/outbound";

export class DrizzleWalletRepository implements WalletRepositoryPort {
  async createForProvider(input: {
    providerId: string;
    currency: string;
  }): Promise<void> {
    // `onConflictDoNothing` on the unique index rather than read-then-write:
    // two concurrent creations both pass a check and only one passes a
    // constraint, so the constraint is what should decide.
    await getDb()
      .insert(wallet)
      .values({ providerId: input.providerId, currency: input.currency })
      .onConflictDoNothing();
  }
}
