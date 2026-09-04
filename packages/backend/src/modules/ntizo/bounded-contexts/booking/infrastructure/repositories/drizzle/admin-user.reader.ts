import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user } from "../../../../../shared/infrastructure/database/user/schemas";
import type { AdminUserReaderPort } from "../../../app/ports/outbound/admin-user-reader.port";

/**
 * Where Booking asks who administers the platform — `role = 'admin' AND
 * status = 'active'`, the same two columns `admin-access.ts`, the GraphQL
 * context and Communication's own reader all read.
 *
 * The identical query Communication's `DrizzleAdminUserReader` runs against
 * the same table, duplicated rather than imported across bounded contexts —
 * see this file's own port for why, and `DrizzleProviderMemberReader` in this
 * directory for the same duplication with the same argument behind it.
 *
 * `status = 'active'` is load-bearing, not decoration: a suspended
 * administrator's inbox is not somewhere a booking's affairs should keep
 * arriving.
 */
export class DrizzleAdminUserReader implements AdminUserReaderPort {
  async findAdminUserIds(): Promise<string[]> {
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.status, "active")));
    return rows.map((row) => row.id);
  }
}
