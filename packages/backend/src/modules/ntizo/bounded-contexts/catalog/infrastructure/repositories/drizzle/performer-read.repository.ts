import { inArray, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type {
  PerformerReadPort,
  PerformerRow,
} from "../../../app/ports/outbound/performer-read.port";

/**
 * The one place the Catalog side joins a User table.
 *
 * Deliberately the whole of it: the join lives here so that widening what is
 * published about a person is a change to one file somebody can review, rather
 * than a column quietly added to a select in the middle of a service query.
 */
export class DrizzlePerformerReadRepository implements PerformerReadPort {
  async byMemberIds(memberIds: string[]): Promise<PerformerRow[]> {
    if (memberIds.length === 0) return [];
    const rows = await getDb()
      .select({
        id: providerMember.id,
        firstName: profile.firstName,
        avatarUrl: profile.avatarUrl,
      })
      .from(providerMember)
      .innerJoin(profile, eq(profile.userId, providerMember.userId))
      .where(inArray(providerMember.id, memberIds));
    return rows;
  }
}
