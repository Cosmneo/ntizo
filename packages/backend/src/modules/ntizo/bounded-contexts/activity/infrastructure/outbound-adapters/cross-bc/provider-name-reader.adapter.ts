import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderNameReaderPort } from "../../../app/ports/outbound/provider-name-reader.port";

/**
 * The single place the Activity context reads Provider's `name` column.
 *
 * A cross-BC adapter rather than an import of Provider's repository or
 * bootstrap, for the same reason `notification`'s own reader of this column
 * is one (F5): this context needs one column off one row, and depending on
 * the other context's bootstrap to get it would couple two lifecycles for a
 * single-row lookup.
 */
export class DrizzleProviderNameReader implements ProviderNameReaderPort {
  async findNameById(providerId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ name: provider.name })
      .from(provider)
      .where(eq(provider.id, providerId))
      .limit(1);
    return row?.name ?? null;
  }
}
