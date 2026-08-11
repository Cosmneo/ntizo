import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { USER_ROLES } from "@ntizo/shared";
import type { UserAdminDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { UserAdminRepositoryPort } from "../../../app/ports/outbound/user-admin.repository.port";

/**
 * Everyone on the platform, for the administration list.
 *
 * Columns are selected explicitly rather than `select()`. The profile table
 * carries a bio, a timezone and a gender, and none of them belong on a screen
 * that exists to answer "who is here and what can they do" — a `SELECT *` here
 * would put every future personal field on it by default.
 */
export class DrizzleUserAdminRepository implements UserAdminRepositoryPort {
  async listAll(
    role: string | undefined,
    search: string | undefined,
    limit: number,
    offset: number,
  ): Promise<UserAdminDTO[]> {
    // Built as a list so "no filters at all" is an absent WHERE rather than
    // `and(undefined, undefined)`, which drizzle will not type.
    const conditions = [];
    // The column is typed to the role union; the filter arrives as a string
    // from GraphQL. Narrowed against the enum rather than cast, so an unknown
    // role is no filter instead of a query that matches nothing.
    if (role && (USER_ROLES as readonly string[]).includes(role)) {
      conditions.push(eq(user.role, role as (typeof USER_ROLES)[number]));
    }
    if (search) {
      conditions.push(
        or(
          ilike(user.email, `%${search}%`),
          ilike(profile.displayName, `%${search}%`),
        )!,
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await getDb()
      .select({
        id: user.id,
        email: user.email,
        name: profile.displayName,
        role: user.role,
        status: user.status,
        phoneNumber: profile.phoneNumber,
        createdAt: user.createdAt,
        // Counted in the query rather than fetched per row: a list of fifty
        // people would otherwise be fifty-one round trips.
        providerCount: sql<number>`(
          select count(*)::int from ${providerMember}
          where ${providerMember.userId} = ${user.id}
        )`,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      // Empty is not a name. The column defaults to "" rather than null, so
      // `?? null` alone would hand the UI a blank where it expects an absence.
      name: r.name?.trim() ? r.name : null,
      role: r.role,
      status: r.status,
      phoneNumber: r.phoneNumber?.trim() ? r.phoneNumber : null,
      providerCount: r.providerCount,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async countAll(): Promise<number> {
    const [row] = await getDb().select({ total: count() }).from(user);
    return row?.total ?? 0;
  }
}
