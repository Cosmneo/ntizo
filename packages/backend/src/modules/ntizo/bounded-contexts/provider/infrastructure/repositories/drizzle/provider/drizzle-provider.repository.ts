import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { ProviderListItemDTO } from "@ntizo/shared";
import type { ProviderRepositoryPort } from "../../../../app/ports/outbound";
import { Provider } from "../../../../domain/aggregates/provider";
import {
  provider as providerTable,
  providerMember as providerMemberTable,
} from "../../../../../../shared/infrastructure/database/provider";
import { getDb } from "../../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMapper } from "./provider.mapper";

/**
 * The order the workspace switcher lists somebody's workspaces in.
 *
 * There was no order at all before this, and Postgres is entitled to return
 * the rows however it likes. That is not merely untidy: `useActiveProvider`
 * falls back to `providers[0]` when neither the URL nor storage names one, so
 * "which workspace am I in" was decided by the planner. An owner holding an
 * approved workspace and a pending duplicate of it could be dropped into the
 * pending one — where every service they publish is filtered straight back
 * out of the storefront by `conditionsFor`'s `provider.status = 'active'`,
 * with nothing on the page saying why.
 *
 * Approved first, then oldest first. The second key is what makes it an
 * order rather than a preference: without it the first of two active
 * workspaces is still arbitrary, and the switcher still shuffles between
 * requests.
 *
 * A module-level export rather than an inline clause, the same reason
 * `conditionsFor` and `orderByFor` are exported from
 * `service-read.repository.ts`: a test asserts on the generated SQL via
 * `.toSQL()`, and a clause buried in a method gives it no seam to call.
 */
export function workspaceListOrder() {
  return [
    // A boolean sorted descending — true before false. Written as raw SQL
    // because the comparison is the sort key, not the column.
    desc(sql`${providerTable.status} = 'active'`),
    asc(providerTable.createdAt),
  ];
}

export class DrizzleProviderRepository implements ProviderRepositoryPort {
  async findById(id: string): Promise<Provider | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerTable)
      .where(eq(providerTable.id, id));
    const row = rows[0];
    return row ? providerMapper.toDomain(row) : null;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<Provider[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerTable)
      .where(eq(providerTable.ownerUserId, ownerUserId));
    return rows.map((r) => providerMapper.toDomain(r));
  }

  async findAllByOwnerOrMemberUserId(userId: string): Promise<Provider[]> {
    const db = getDb();
    // Find all provider ids the user is a member of.
    const memberRows = await db
      .select({ providerId: providerMemberTable.providerId })
      .from(providerMemberTable)
      .where(eq(providerMemberTable.userId, userId));
    const memberProviderIds = memberRows.map((r) => r.providerId);

    const rows = await db
      .select()
      .from(providerTable)
      .where(
        memberProviderIds.length > 0
          ? or(
              eq(providerTable.ownerUserId, userId),
              inArray(providerTable.id, memberProviderIds),
            )
          : eq(providerTable.ownerUserId, userId),
      );

    // Deduplicate by id (owner may also appear in provider_member).
    const seen = new Set<string>();
    const unique: typeof rows = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      unique.push(r);
    }
    return unique.map((r) => providerMapper.toDomain(r));
  }

  async findListItemsForUser(
    userId: string,
  ): Promise<ProviderListItemDTO[]> {
    const db = getDb();
    // LEFT JOIN provider_member scoped to this user so each row carries the
    // viewer's membership (if any). Filter by owner OR member-of-this-user.
    const rows = await db
      .select({
        id: providerTable.id,
        name: providerTable.name,
        slug: providerTable.slug,
        type: providerTable.type,
        status: providerTable.status,
        ownerUserId: providerTable.ownerUserId,
        memberRole: providerMemberTable.role,
      })
      .from(providerTable)
      .leftJoin(
        providerMemberTable,
        and(
          eq(providerMemberTable.providerId, providerTable.id),
          eq(providerMemberTable.userId, userId),
        ),
      )
      .where(
        or(
          eq(providerTable.ownerUserId, userId),
          eq(providerMemberTable.userId, userId),
        ),
      )
      // Before the de-duplication below, not after: that loop keeps the first
      // row it sees for each id, so the order it reads in is the order it
      // returns.
      .orderBy(...workspaceListOrder());

    const seen = new Set<string>();
    const out: ProviderListItemDTO[] = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const role: ProviderListItemDTO["role"] =
        r.ownerUserId === userId
          ? "owner"
          : (r.memberRole as ProviderListItemDTO["role"]);
      out.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        type: r.type as ProviderListItemDTO["type"],
        status: r.status,
        role,
      });
    }
    return out;
  }

  async findBySlug(slug: string): Promise<Provider | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerTable)
      .where(eq(providerTable.slug, slug));
    const row = rows[0];
    return row ? providerMapper.toDomain(row) : null;
  }

  async save(provider: Provider): Promise<void> {
    const db = getDb();
    const values = providerMapper.toPersistence(provider);
    // Everything the mapper produced, minus what must never change on an
    // update. Hand-listing the mutable columns is what silently lost the logo
    // and portfolio keys: the aggregate carried them, the mutation accepted
    // them, the mapper wrote them into `values` — and this object, three
    // layers further down, simply had no such fields, so the UPDATE never
    // mentioned them and Postgres left the columns as they were.
    //
    // Derived from `values` instead, so a column added to the table and the
    // mapper is saved without anyone remembering to come back here.
    const { id, ownerUserId, type, createdAt, ...mutable } = values;
    void id;
    void ownerUserId;
    void type;
    void createdAt;

    await db
      .insert(providerTable)
      .values(values)
      .onConflictDoUpdate({ target: providerTable.id, set: mutable });
  }
}
