import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { platformSettings } from "../../../../../shared/infrastructure/database/platform/schemas";
import type { PlatformSettingsReaderPort } from "../../../app/ports/outbound/platform-settings.reader.port";

/**
 * The single `global` row's `checkout_hold_minutes`, `provider_response_minutes`
 * and `payment_window_minutes`, with no fallback.
 *
 * The row is guaranteed to exist for any database that has run migration
 * `0026_lame_wendell_vaughn.sql`: alongside the column and its CHECK, that
 * migration inserts the `global` row (`ON CONFLICT ("id") DO NOTHING`, so it
 * never overwrites values an administrator already set — dev already had a
 * hand-written row with a non-default commission rate before this task, and
 * that had to survive). Before this task, nothing did: `CREATE TABLE` in
 * migration `0010` set only column-level defaults for future inserts, not a
 * row of its own, so `platform_settings` could be empty on a fresh QA or
 * prod database. That gap for tables before `0026` — and for any future
 * singleton-row table nobody thinks to seed — is filed as its own follow-up,
 * not fixed here.
 *
 * Provider's sibling adapter (`DrizzlePlatformSettingsAdapter`) falls back to
 * a hardcoded number when the row is missing, reasoning that a platform on
 * its first deploy shouldn't be unable to create a workspace. That reasoning
 * does not carry over here: falling back would silently book against a
 * window nobody chose, which is exactly the failure `CreateBookingCommand`
 * was told not to reintroduce (see its own history — this port replaced a
 * hardcoded constant for that reason). Throwing turns a missing settings row
 * into a loud failure an operator can fix — one migration `0026` means
 * should not be reachable going forward — instead of a wrong number nobody
 * notices until a customer disputes how long their slot was actually held.
 *
 * Each of the three methods below runs its own query rather than sharing one
 * cached read: every call site (`create`, `submit`, `accept`) reads at a
 * different moment in the flow, sometimes minutes or hours apart, and a
 * value cached at the reader's construction would defeat the whole point of
 * LIVE settings — an administrator's change would only reach whichever of
 * the three happened to run before the process restarted.
 */
export class DrizzlePlatformSettingsReader implements PlatformSettingsReaderPort {
  private async findMinutes(
    column: "checkoutHoldMinutes" | "providerResponseMinutes" | "paymentWindowMinutes",
    settingName: string,
  ): Promise<number> {
    const [row] = await getDb()
      .select({ minutes: platformSettings[column] })
      .from(platformSettings)
      .where(eq(platformSettings.id, "global"))
      .limit(1);

    if (row === undefined) {
      throw new Error(`platform_settings has no 'global' row — cannot read ${settingName}`);
    }
    return row.minutes;
  }

  async findCheckoutHoldMinutes(): Promise<number> {
    return this.findMinutes("checkoutHoldMinutes", "checkout_hold_minutes");
  }

  async findProviderResponseMinutes(): Promise<number> {
    return this.findMinutes("providerResponseMinutes", "provider_response_minutes");
  }

  async findPaymentWindowMinutes(): Promise<number> {
    return this.findMinutes("paymentWindowMinutes", "payment_window_minutes");
  }
}
