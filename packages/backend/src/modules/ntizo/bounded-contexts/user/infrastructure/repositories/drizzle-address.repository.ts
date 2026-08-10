import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";
import { address } from "../../../../shared/infrastructure/database/user";
import { Address } from "../../domain/aggregates/address.aggregate";
import type { AddressRepositoryPort } from "../../app/ports/outbound/address.repository.port";

type Row = typeof address.$inferSelect;

function toAggregate(row: Row): Address {
  return Address.rehydrate({
    id: row.id,
    userId: row.userId,
    label: row.label,
    country: row.country,
    city: row.city,
    district: row.district,
    line1: row.line1,
    line2: row.line2,
    postalCode: row.postalCode,
    directions: row.directions,
    latitude: row.latitude,
    longitude: row.longitude,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleAddressRepository implements AddressRepositoryPort {
  async listByUserId(userId: string): Promise<Address[]> {
    const rows = await getDb()
      .select()
      .from(address)
      .where(eq(address.userId, userId))
      // Default first, then oldest: the one a booking will preselect should be
      // the one at the top of the list the user is reading.
      .orderBy(asc(address.isDefault), asc(address.createdAt));
    return rows.reverse().map(toAggregate);
  }

  async findByIdForUser(id: string, userId: string): Promise<Address | null> {
    const [row] = await getDb()
      .select()
      .from(address)
      .where(and(eq(address.id, id), eq(address.userId, userId)))
      .limit(1);
    return row ? toAggregate(row) : null;
  }

  async save(entity: Address): Promise<void> {
    const props = entity.toJSON();
    await getDb()
      .insert(address)
      .values(props)
      .onConflictDoUpdate({ target: address.id, set: { ...props, id: undefined } });
  }

  async delete(id: string, userId: string): Promise<void> {
    // The owner is part of the WHERE, not checked beforehand: a delete that
    // matches nothing is the correct outcome for someone else's id.
    await getDb()
      .delete(address)
      .where(and(eq(address.id, id), eq(address.userId, userId)));
  }

  async clearDefaultForUser(userId: string, exceptId: string): Promise<void> {
    await getDb()
      .update(address)
      .set({ isDefault: false })
      .where(and(eq(address.userId, userId), ne(address.id, exceptId)));
  }
}
