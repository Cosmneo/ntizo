import { asc, eq } from "drizzle-orm";
import type { AddressDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { address } from "../../../../../shared/infrastructure/database/user";
import type { AddressReadRepositoryPort } from "../../../app/ports/outbound/address-read.repository.port";

/**
 * The column list is the projection. `userId` is filtered on and never
 * selected: the caller already knows whose addresses these are, and a DTO
 * that carries an owner id invites a component to compare it against
 * something instead of trusting the query.
 */
export class DrizzleAddressReadRepository implements AddressReadRepositoryPort {
  async listForUser(userId: string): Promise<AddressDTO[]> {
    const rows = await getDb()
      .select({
        id: address.id,
        label: address.label,
        country: address.country,
        city: address.city,
        district: address.district,
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postalCode,
        directions: address.directions,
        latitude: address.latitude,
        longitude: address.longitude,
        isDefault: address.isDefault,
      })
      .from(address)
      .where(eq(address.userId, userId))
      .orderBy(asc(address.createdAt));

    // Default first. Sorted here rather than in SQL because "default, then
    // oldest" needs two keys in opposite directions and reads worse as an
    // ORDER BY than as one line here.
    return [...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }
}
