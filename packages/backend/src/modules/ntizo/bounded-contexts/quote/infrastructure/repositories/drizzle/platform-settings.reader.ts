import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { platformSettings } from "../../../../../shared/infrastructure/database/platform/schemas";
import type { PlatformSettingsReaderPort } from "../../../app/ports/outbound/platform-settings.reader.port";

/**
 * The single `global` row's `quote_proposal_validity_hours` and
 * `min_service_price_minor`, with no fallback — matching Booking's own
 * `DrizzlePlatformSettingsReader`, not Provider's: a silently-defaulted
 * proposal window or price floor is a worse failure than a loud one, so a
 * missing row throws rather than making up a number nobody chose.
 *
 * Both methods read live, one query each: `findQuoteProposalValidityHours`
 * and `findMinServicePriceMinor` are each called at a different moment of
 * `ProposeQuoteCommand`'s run, so nothing here is cached across calls.
 */
export class DrizzleQuotePlatformSettingsReader implements PlatformSettingsReaderPort {
  private async global() {
    const [row] = await getDb()
      .select({
        validity: platformSettings.quoteProposalValidityHours,
        minPrice: platformSettings.minServicePriceMinor,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, "global"))
      .limit(1);
    if (!row) throw new Error("platform_settings has no 'global' row — cannot read quote settings");
    return row;
  }

  async findQuoteProposalValidityHours(): Promise<number> {
    return (await this.global()).validity;
  }

  async findMinServicePriceMinor(): Promise<number> {
    return (await this.global()).minPrice;
  }
}
