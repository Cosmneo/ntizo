import { and, eq, inArray } from "drizzle-orm";
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  provider,
  providerMember,
  providerInvite,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { ProviderReadRepositoryPort } from "../../../app/ports/outbound/provider-read.repository.port";

/**
 * Read-side repository. Projects straight to read models — no aggregate
 * hydration. Member names come from ntizo's own user + profile tables, NOT
 * from better-auth's user table (no cross-module reach).
 */
export class DrizzleProviderReadRepository implements ProviderReadRepositoryPort {
  async listForUser(userId: string): Promise<ProviderListItemDTO[]> {
    const rows = await getDb()
      .select({
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        type: provider.type,
        status: provider.status,
        role: providerMember.role,
      })
      .from(providerMember)
      .innerJoin(provider, eq(provider.id, providerMember.providerId))
      .where(eq(providerMember.userId, userId));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type as ProviderListItemDTO["type"],
      status: r.status,
      role: r.role as ProviderListItemDTO["role"],
    }));
  }

  async isMember(providerId: string, userId: string): Promise<boolean> {
    const rows = await getDb()
      .select({ userId: providerMember.userId })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async findDetailById(providerId: string): Promise<ProviderDetailDTO | null> {
    const [row] = await getDb()
      .select()
      .from(provider)
      .where(eq(provider.id, providerId))
      .limit(1);
    if (!row) return null;

    const memberRows = await getDb()
      .select({
        userId: providerMember.userId,
        role: providerMember.role,
        joinedAt: providerMember.joinedAt,
      })
      .from(providerMember)
      .where(eq(providerMember.providerId, providerId));

    const userIds = memberRows.map((m) => m.userId);
    const people = userIds.length
      ? await getDb()
          .select({
            id: user.id,
            email: user.email,
            displayName: profile.displayName,
          })
          .from(user)
          .leftJoin(profile, eq(profile.userId, user.id))
          .where(inArray(user.id, userIds))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    const inviteRows = await getDb()
      .select({
        id: providerInvite.id,
        email: providerInvite.email,
        role: providerInvite.role,
        status: providerInvite.status,
      })
      .from(providerInvite)
      .where(eq(providerInvite.providerId, providerId));

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type as ProviderDetailDTO["type"],
      status: row.status,
      description: row.description ?? null,
      // Flat columns, reassembled. The table stores the Address VO spread
      // across `address_*`; the read model gives it back as one object so the
      // settings form has something shaped like the thing it edits.
      address: {
        street: row.addressStreet ?? null,
        city: row.addressCity ?? null,
        district: row.addressDistrict ?? null,
        country: row.addressCountry ?? null,
        postalCode: row.addressPostalCode ?? null,
      },
      ownerUserId: row.ownerUserId,
      members: memberRows.map((m) => ({
        userId: m.userId,
        email: byId.get(m.userId)?.email ?? "",
        name: byId.get(m.userId)?.displayName ?? null,
        role: m.role as ProviderDetailDTO["members"][number]["role"],
        joinedAt: m.joinedAt.toISOString(),
      })),
      invites: inviteRows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role as ProviderDetailDTO["invites"][number]["role"],
        status: i.status,
      })),
    };
  }
}
