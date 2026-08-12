import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import { mediaUrl } from "../../../../../shared/infrastructure/media/media-url";
import type { ProviderPublicRepositoryPort } from "../../../app/ports/outbound/provider-public.repository.port";

/**
 * Wraps a search term in a LIKE pattern, escaping the metacharacters first.
 *
 * Without the escape, a search for "100%" matches every provider and "_"
 * matches all of them too — those wildcards are the user's typing, not their
 * intent. Postgres treats backslash as LIKE's escape character by default, so
 * the backslash itself is escaped first or it would escape the escapes.
 *
 * Exported for its own test: the behaviour is invisible from the outside
 * until someone searches for a percent sign.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

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
    logoKey: provider.logoKey,
  };

  private static toDTO(row: {
    id: string; name: string; slug: string; type: string;
    description: string | null; city: string | null;
    district: string | null; country: string | null;
    logoKey: string | null;
  }): ProviderPublicDTO {
    const { logoKey, ...rest } = row;
    return { ...rest, type: row.type as ProviderPublicDTO["type"], logoUrl: mediaUrl(logoKey) };
  }

  async listActive(
    limit: number,
    offset: number,
    search?: string,
  ): Promise<ProviderPublicDTO[]> {
    const filters: SQL[] = [eq(provider.status, "active")];

    if (search) {
      const pattern = likePattern(search);
      // Only across fields the public DTO already exposes. Searching a column
      // this repository deliberately never selects — the street, the owner —
      // would leak it: a caller could confirm a hidden value by whether a row
      // comes back.
      const match = or(
        ilike(provider.name, pattern),
        ilike(provider.addressCity, pattern),
        ilike(provider.description, pattern),
      );
      if (match) filters.push(match);
    }

    const rows = await getDb()
      .select(DrizzleProviderPublicRepository.COLUMNS)
      .from(provider)
      .where(and(...filters))
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
