import { inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderNameReaderPort } from "../../../app/ports/outbound/provider-name-reader.port";

/**
 * The read tier's own reach into `provider.name` — see the port's doc
 * comment for why this does not extend the write tier's `ProviderReaderPort`
 * instead.
 */
export class DrizzleProviderNameReader implements ProviderNameReaderPort {
  async findNamesByIds(providerIds: string[]): Promise<Map<string, string>> {
    if (providerIds.length === 0) return new Map();

    const rows = await getDb()
      .select({ id: provider.id, name: provider.name })
      .from(provider)
      .where(inArray(provider.id, providerIds));

    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
