import type { ProviderPublicDTO } from "@ntizo/shared";

/**
 * The public read port. Separate from `ProviderReadRepositoryPort` on purpose:
 * that one answers "what may THIS member see", and every method on it takes a
 * requester. This one answers "what may ANYONE see", and takes none — so there
 * is no requester parameter to forget to check.
 */
export interface ProviderPublicRepositoryPort {
  /** Active providers only. Ordered by name so paging is stable. */
  listActive(limit: number, offset: number): Promise<ProviderPublicDTO[]>;
  /** Active provider by slug, or null. An inactive one is indistinguishable from a missing one. */
  findActiveBySlug(slug: string): Promise<ProviderPublicDTO | null>;
}
