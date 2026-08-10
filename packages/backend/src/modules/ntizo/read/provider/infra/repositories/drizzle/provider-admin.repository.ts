import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { ProviderAdminDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../../../shared/infrastructure/database/user/schemas";
import { likePattern } from "../../../../../public/provider/infra/repositories/drizzle/provider-public.repository";
import type { ProviderAdminRepositoryPort } from "../../../app/ports/outbound/provider-read.repository.port";

/**
 * The platform-wide provider read, for the admin queue.
 *
 * Unlike the public repository, this one is allowed to see everything — that
 * is the whole point of the queue, and pending applications are exactly what
 * the public one must never return. The narrowing that matters here is who may
 * call it, and that lives at the GraphQL edge in `requireAdminUserId`.
 */
export class DrizzleProviderAdminRepository implements ProviderAdminRepositoryPort {
  async listAll(
    status: string | undefined,
    search: string | undefined,
    limit: number,
    offset: number,
  ): Promise<ProviderAdminDTO[]> {
    const filters: SQL[] = [];
    if (status) filters.push(eq(provider.status, status));
    if (search) {
      const pattern = likePattern(search);
      const match = or(
        ilike(provider.name, pattern),
        ilike(provider.slug, pattern),
        ilike(user.email, pattern),
      );
      if (match) filters.push(match);
    }

    const rows = await getDb()
      .select({
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        type: provider.type,
        status: provider.status,
        description: provider.description,
        city: provider.addressCity,
        country: provider.addressCountry,
        ownerEmail: user.email,
        createdAt: provider.createdAt,
      })
      .from(provider)
      // Left, not inner: an owner row that went missing must not delete the
      // provider from the queue. A business with no visible owner is a thing
      // an admin needs to see, not a thing that should disappear.
      .leftJoin(user, eq(user.id, provider.ownerUserId))
      .where(filters.length ? and(...filters) : undefined)
      // Newest first: the queue is worked from the top, and the thing that
      // just arrived is the thing nobody has looked at.
      .orderBy(desc(provider.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      ...row,
      type: row.type as ProviderAdminDTO["type"],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await getDb()
      .select({ status: provider.status, n: count() })
      .from(provider)
      .groupBy(provider.status);
    // A status with no providers is absent from the result, not zero. The
    // caller fills the gaps — the tab has to render either way.
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
