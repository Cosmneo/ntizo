import { and, eq } from "drizzle-orm";
import type { ProviderInviteRepositoryPort } from "../../../../app/ports/outbound";
import { ProviderInvite } from "../../../../domain/entities/provider-invite";
import { providerInvite as providerInviteTable } from "../../../../../../shared/infrastructure/database/provider";
import { getDb } from "../../../../../../../better-auth/infrastructure/client/drizzle";
import { providerInviteMapper } from "./provider-invite.mapper";

export class DrizzleProviderInviteRepository
  implements ProviderInviteRepositoryPort
{
  async findById(id: string): Promise<ProviderInvite | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerInviteTable)
      .where(eq(providerInviteTable.id, id));
    const row = rows[0];
    return row ? providerInviteMapper.toDomain(row) : null;
  }

  async findByToken(token: string): Promise<ProviderInvite | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerInviteTable)
      .where(eq(providerInviteTable.token, token));
    const row = rows[0];
    return row ? providerInviteMapper.toDomain(row) : null;
  }

  async findByProviderAndEmail(
    providerId: string,
    email: string,
  ): Promise<ProviderInvite | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerInviteTable)
      .where(
        and(
          eq(providerInviteTable.providerId, providerId),
          eq(providerInviteTable.email, email.toLowerCase()),
        ),
      );
    const row = rows[0];
    return row ? providerInviteMapper.toDomain(row) : null;
  }

  async findByProviderId(providerId: string): Promise<ProviderInvite[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerInviteTable)
      .where(eq(providerInviteTable.providerId, providerId));
    return rows.map((r) => providerInviteMapper.toDomain(r));
  }

  async save(invite: ProviderInvite): Promise<void> {
    const db = getDb();
    const values = providerInviteMapper.toPersistence(invite);
    await db
      .insert(providerInviteTable)
      .values(values)
      .onConflictDoUpdate({
        target: providerInviteTable.id,
        set: {
          status: values.status,
          expiresAt: values.expiresAt,
          role: values.role,
          token: values.token,
        },
      });
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db
      .delete(providerInviteTable)
      .where(eq(providerInviteTable.id, id));
  }
}
