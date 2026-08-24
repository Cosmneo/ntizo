import type {
  ProviderAdminDetailDTO,
  ProviderAdminDTO,
  ProviderDetailDTO,
  ProviderListItemDTO,
} from "@ntizo/shared/read-models";

export interface ProviderReadRepositoryPort {
  listForUser(userId: string): Promise<ProviderListItemDTO[]>;
  findDetailById(providerId: string): Promise<ProviderDetailDTO | null>;
  isMember(providerId: string, userId: string): Promise<boolean>;
}

/**
 * The platform-wide view, for the admin review queue.
 *
 * Separate from the port above on purpose: every method there answers "what
 * may THIS member see" and takes a user id. These take none, because the
 * answer does not vary by admin — so there is no requester parameter here to
 * forget to check, and the authorization lives at the one edge that has it.
 */
export interface ProviderAdminRepositoryPort {
  /** Every provider, newest application first. `status` absent means all of them. */
  listAll(
    status: string | undefined,
    search: string | undefined,
    limit: number,
    offset: number,
  ): Promise<ProviderAdminDTO[]>;
  /** One count per status, for the queue's tab badges. */
  countByStatus(): Promise<Record<string, number>>;
  /**
   * One business, with everything the decision turns on.
   *
   * Null rather than throwing: "no such provider" is an answer this read can
   * legitimately give — an admin can follow a stale link — and the edge is
   * where that becomes a 404.
   */
  findDetailForAdmin(providerId: string): Promise<ProviderAdminDetailDTO | null>;
}
