import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user } from "../../../../../shared/infrastructure/database/user/schemas";
import type { AdminUserReaderPort } from "../../../app/ports/outbound/admin-user-reader.port";

/** `role = 'admin' AND status = 'active'` — the same two columns `admin-access.ts` and the GraphQL context read. */
export class DrizzleAdminUserReader implements AdminUserReaderPort {
  async findAdminUserIds(): Promise<string[]> {
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.status, "active")));
    return rows.map((r) => r.id);
  }
}
