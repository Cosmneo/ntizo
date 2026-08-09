import { and, asc, eq } from "drizzle-orm";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderPublicRepositoryPort } from "../../../app/ports/outbound/provider-public.repository.port";

/**
 * Public read repository.
 *
 * The column list is the security boundary, not the DTO. Selecting `*` and
 * mapping to the narrow DTO would work today and leak the day someone adds a
 * field to the mapper — so the projection is pushed into the SELECT itself:
 * `ownerUserId`, the street, the postal code and the coordinates are never
 * read out of the database at all.
 */
export class DrizzleProviderPublicRepository implements ProviderPublicRepositoryPort {
  private static readonly COLUMNS = {
    id: provider.id,
    name: provider.name,
    slug: provider.slug,
    type: provider.type,
    description: provider.description,
    city: provider.addressCity,
    district: provider.addressDistrict,
    country: provider.addressCountry,
  };

  private static toDTO(row: {
    id: string; name: string; slug: string; type: string;
    description: string | null; city: string | null;
    district: string | null; country: string | null;
  }): ProviderPublicDTO {
    return { ...row, type: row.type as ProviderPublicDTO["type"] };
  }

  async listActive(limit: number, offset: number): Promise<ProviderPublicDTO[]> {
    const rows = await getDb()
      .select(DrizzleProviderPublicRepository.COLUMNS)
      .from(provider)
      .where(eq(provider.status, "active"))
      .orderBy(asc(provider.name))
      .limit(limit)
      .offset(offset);
    return rows.map(DrizzleProviderPublicRepository.toDTO);
  }

  async findActiveBySlug(slug: string): Promise<ProviderPublicDTO | null> {
    const [row] = await getDb()
      .select(DrizzleProviderPublicRepository.COLUMNS)
      .from(provider)
      // `status = active` is part of the lookup, not a filter applied after —
      // so an inactive provider can never be returned by a slug that matches.
      .where(and(eq(provider.slug, slug), eq(provider.status, "active")))
      .limit(1);
    return row ? DrizzleProviderPublicRepository.toDTO(row) : null;
  }
}
