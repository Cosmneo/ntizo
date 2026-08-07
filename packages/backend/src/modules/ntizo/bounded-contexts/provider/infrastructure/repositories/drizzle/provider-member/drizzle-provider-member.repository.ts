import { and, eq } from "drizzle-orm";
import type { ProviderMemberRepositoryPort } from "../../../../app/ports/outbound";
import { ProviderMember } from "../../../../domain/entities/provider-member";
import { providerMember as providerMemberTable } from "../../../../../../shared/infrastructure/database/provider";
import { getDb } from "../../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMemberMapper } from "./provider-member.mapper";

export class DrizzleProviderMemberRepository
  implements ProviderMemberRepositoryPort
{
  async findByProviderId(providerId: string): Promise<ProviderMember[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerMemberTable)
      .where(eq(providerMemberTable.providerId, providerId));
    return rows.map((r) => providerMemberMapper.toDomain(r));
  }

  async findByProviderAndUser(
    providerId: string,
    userId: string,
  ): Promise<ProviderMember | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(providerMemberTable)
      .where(
        and(
          eq(providerMemberTable.providerId, providerId),
          eq(providerMemberTable.userId, userId),
        ),
      );
    const row = rows[0];
    return row ? providerMemberMapper.toDomain(row) : null;
  }

  async save(member: ProviderMember): Promise<void> {
    const db = getDb();
    const values = providerMemberMapper.toPersistence(member);
    await db
      .insert(providerMemberTable)
      .values(values)
      .onConflictDoUpdate({
        target: providerMemberTable.id,
        set: { role: values.role },
      });
  }

  async delete(providerId: string, userId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(providerMemberTable)
      .where(
        and(
          eq(providerMemberTable.providerId, providerId),
          eq(providerMemberTable.userId, userId),
        ),
      );
  }
}
