import { eq } from "drizzle-orm";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";
import { platformSettings } from "../../../../shared/infrastructure/database/platform/schemas";
import type { PlatformSettingsPort } from "../../app/ports/outbound";

/** The single settings row, or the schema's own defaults if nobody wrote one. */
export class DrizzlePlatformSettingsAdapter implements PlatformSettingsPort {
  async defaultCommissionBps(): Promise<number> {
    const [row] = await getDb()
      .select({ bps: platformSettings.defaultCommissionBps })
      .from(platformSettings)
      .where(eq(platformSettings.id, "global"))
      .limit(1);

    // Falling back rather than throwing: a platform with no settings row yet
    // is a platform on its first deploy, and refusing to create workspaces
    // until somebody opens an admin screen would be a worse failure than
    // using the value the column already defaults to.
    return row?.bps ?? 1000;
  }
}
