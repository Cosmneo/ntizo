import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { CustomerNameReaderPort } from "../../../app/ports/outbound/customer-name-reader.port";

/**
 * The read tier's own reach into `user`/`profile` — see the port's doc
 * comment for why this does not extend the write tier's `ProviderReaderPort`
 * or the Communication bounded context's own ports.
 *
 * `leftJoin`, not `innerJoin`: `profile` is created empty on registration
 * (see `profile.schema.ts`) and, same as `DrizzleUserReadRepository`, a
 * customer who has never filled theirs in must still resolve to *something*
 * rather than being silently dropped from the map — an `innerJoin` would
 * make a fresh customer's thread look exactly like one that missed the
 * lookup entirely, degrading to `""` for a reason nobody could tell apart
 * from "this user does not exist".
 */
export class DrizzleCustomerNameReader implements CustomerNameReaderPort {
  async findNamesByIds(customerUserIds: string[]): Promise<Map<string, string>> {
    if (customerUserIds.length === 0) return new Map();

    const rows = await getDb()
      .select({
        id: user.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(inArray(user.id, customerUserIds));

    return new Map(
      rows.map((r) => {
        // Same formula `DrizzleUserReadRepository.findCurrentUser` already
        // settled on for a person's own account page — copied rather than
        // re-derived, so a customer's name reads identically here.
        const firstName = r.firstName ?? "";
        const lastName = r.lastName ?? "";
        const name = r.displayName ?? `${firstName} ${lastName}`.trim();
        return [r.id, name];
      }),
    );
  }
}
