import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type {
  ProviderSnapshot,
  ProviderSnapshotReaderPort,
} from "../../../app/ports/outbound/provider-snapshot.reader.port";

/**
 * One row, by id, no status filter.
 *
 * Not filtered to `status = 'active'`: the port's contract is "gone" versus
 * "exists, with a real (possibly zero) commission rate" — see
 * `ProviderSnapshotReaderPort`'s own doc comment. Whether a non-active
 * provider's services should have been bookable at all is
 * `CreateBookingCommand`'s question (via `serviceStatus`/`optionIsActive`),
 * answered from the catalog snapshot already read; this reader only answers
 * "does the provider id on that snapshot still resolve to a row".
 */
export class DrizzleProviderSnapshotReader implements ProviderSnapshotReaderPort {
  async findForBooking(providerId: string): Promise<ProviderSnapshot | null> {
    const [row] = await getDb()
      .select({
        commissionBps: provider.commissionBps,
        name: provider.name,
        slug: provider.slug,
      })
      .from(provider)
      .where(eq(provider.id, providerId))
      .limit(1);
    return row ?? null;
  }
}
