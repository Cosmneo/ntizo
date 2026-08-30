import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { platformSettings } from "../../../../../shared/infrastructure/database/platform/schemas";
import type { PlatformSettingsReaderPort } from "../../../app/ports/outbound/platform-settings.reader.port";

/**
 * The single `global` row's `payment_window_minutes`, with no fallback.
 *
 * Provider's sibling adapter (`DrizzlePlatformSettingsAdapter`) falls back to
 * a hardcoded number when the row is missing, reasoning that a platform on
 * its first deploy shouldn't be unable to create a workspace. That reasoning
 * does not carry over here: falling back would silently book against a
 * window nobody chose, which is exactly the failure `CreateBookingCommand`
 * was told not to reintroduce (see its own history — this port replaced a
 * hardcoded constant for that reason). Throwing turns a missing settings row
 * into a loud failure an operator can fix, instead of a wrong number nobody
 * notices until a customer disputes how long their slot was actually held.
 */
export class DrizzlePlatformSettingsReader implements PlatformSettingsReaderPort {
  async findPaymentWindowMinutes(): Promise<number> {
    const [row] = await getDb()
      .select({ minutes: platformSettings.paymentWindowMinutes })
      .from(platformSettings)
      .where(eq(platformSettings.id, "global"))
      .limit(1);

    if (row === undefined) {
      throw new Error(
        "platform_settings has no 'global' row — cannot read payment_window_minutes",
      );
    }
    return row.minutes;
  }
}
