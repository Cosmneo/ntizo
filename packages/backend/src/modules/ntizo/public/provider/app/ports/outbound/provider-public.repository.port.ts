import type { ProviderPublicDTO } from "@ntizo/shared";

/**
 * The public read port. Separate from `ProviderReadRepositoryPort` on purpose:
 * that one answers "what may THIS member see", and every method on it takes a
 * requester. This one answers "what may ANYONE see", and takes none — so there
 * is no requester parameter to forget to check.
 */
export interface ProviderPublicRepositoryPort {
  /**
   * Active providers only. Ordered by name so paging is stable.
   *
   * `search` filters on the fields the public DTO already exposes. Passing it
   * here rather than filtering the returned page keeps paging honest: a
   * client-side filter would hand back 3 of 20 rows and call it a full page.
   */
  listActive(limit: number, offset: number, search?: string): Promise<ProviderPublicDTO[]>;
  /** Active provider by slug, or null. An inactive one is indistinguishable from a missing one. */
  findActiveBySlug(slug: string): Promise<ProviderPublicDTO | null>;
}
