import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { ActorReaderPort, ActorSummary } from "../../../app/ports/outbound/actor-reader.port";

/**
 * The read tier's own reach into `user`/`profile` for the feed's actors.
 *
 * `leftJoin`, not `innerJoin`: `profile` is created empty on registration
 * and an account that never filled it in must still resolve to its email
 * rather than vanish from the map, which would make it look like a deleted
 * account. The name formula is `DrizzleCustomerNameReader`'s, copied rather
 * than re-derived, so a person reads the same here as in the support queue.
 */
export class DrizzleActorReader implements ActorReaderPort {
  async findActorsByIds(userIds: string[]): Promise<Map<string, ActorSummary>> {
    if (userIds.length === 0) return new Map();

    const rows = await getDb()
      .select({
        id: user.id,
        email: user.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(inArray(user.id, userIds));

    return new Map(
      rows.map((r) => {
        const name = r.displayName ?? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
        return [r.id, { name, email: r.email }];
      }),
    );
  }
}
