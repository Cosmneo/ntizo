import type { ProviderListItemDTO } from "@ntizo/shared";
import type { Provider } from "../../../domain/aggregates";

export interface ProviderRepositoryPort {
  findById(id: string): Promise<Provider | null>;
  findByOwnerUserId(ownerUserId: string): Promise<Provider[]>;
  findBySlug(slug: string): Promise<Provider | null>;
  /**
   * Returns all providers where the user is either the owner OR a member.
   * Kept for potential future callers; the `GET /providers/mine` read path
   * now uses `findListItemsForUser` instead.
   */
  findAllByOwnerOrMemberUserId(userId: string): Promise<Provider[]>;
  /**
   * Viewer-scoped list projection used by `GET /providers/mine`.
   * Single SQL query joining provider + provider_member to compute the
   * viewer's role per provider.
   */
  findListItemsForUser(userId: string): Promise<ProviderListItemDTO[]>;
  save(provider: Provider): Promise<void>;
}
