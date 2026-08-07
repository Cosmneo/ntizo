import { and, eq, inArray, or } from "drizzle-orm";
import type { ProviderListItemDTO } from "@ntizo/shared";
import type { ProviderRepositoryPort } from "../../../../app/ports/outbound";
import { Provider } from "../../../../domain/aggregates/provider";
import {
  provider as providerTable,
  providerMember as providerMemberTable,
} from "../../../../../../shared/infrastructure/database/provider";
import { getDb } from "../../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMapper } from "./provider.mapper";

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
      );

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
    await db
      .insert(providerTable)
      .values(values)
      .onConflictDoUpdate({
        target: providerTable.id,
        set: {
          name: values.name,
          slug: values.slug,
          status: values.status,
          description: values.description,
          addressStreet: values.addressStreet,
          addressCity: values.addressCity,
          addressDistrict: values.addressDistrict,
          addressCountry: values.addressCountry,
          addressPostalCode: values.addressPostalCode,
          addressLat: values.addressLat,
          addressLng: values.addressLng,
          updatedAt: values.updatedAt,
        },
      });
  }
}
