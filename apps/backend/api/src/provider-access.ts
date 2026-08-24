import { DrizzleProviderReadRepository } from "@ntizo/backend/modules/ntizo/read/provider";

/**
 * May this user write under this provider's prefix?
 *
 * Authentication is not authorisation, and for a while these routes acted as
 * if it were: any signed-in stranger could `PUT` bytes under any provider's
 * key space. Nothing they uploaded could be *attached* — the mutations check
 * membership — but they could fill someone else's prefix with whatever they
 * liked, and once the admin review queue reads a provider's documents by
 * prefix, "whose file is this" stops being a rhetorical question.
 *
 * Kept in one place so the two upload mounts cannot drift apart on it.
 */
export function canWriteProviderMedia(
  providerId: string,
  userId: string,
): Promise<boolean> {
  return new DrizzleProviderReadRepository().isMember(providerId, userId);
}
