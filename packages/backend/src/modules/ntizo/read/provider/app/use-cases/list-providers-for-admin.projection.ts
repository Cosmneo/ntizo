import { ProviderStatus } from "@ntizo/shared";
import type { ProviderAdminDTO, ProviderStatusCountsDTO } from "@ntizo/shared/read-models";
import type {
  CountProvidersByStatusPort,
  ListProvidersForAdminInput,
  ListProvidersForAdminPort,
} from "../ports/inbound";
import type { ProviderAdminRepositoryPort } from "../ports/outbound/provider-read.repository.port";

/** Hard ceiling. The queue is paged; nothing needs the whole platform at once. */
export const MAX_ADMIN_PAGE_SIZE = 50;

export class ListProvidersForAdminProjection implements ListProvidersForAdminPort {
  constructor(private readonly repo: ProviderAdminRepositoryPort) {}

  async execute(input: ListProvidersForAdminInput): Promise<ProviderAdminDTO[]> {
    // Clamped here rather than trusted from the schema: the schema bound is a
    // contract, this is the enforcement.
    const limit = Math.min(Math.max(input.limit, 1), MAX_ADMIN_PAGE_SIZE);
    const offset = Math.max(input.offset, 0);
    // Whitespace-only is no filter, not a search for spaces — a stray space
    // must not empty a queue somebody is working through.
    const status = input.status?.trim() || undefined;
    const search = input.search?.trim() || undefined;
    return this.repo.listAll(status, search, limit, offset);
  }
}

/**
 * One count per status. The repository answers only the statuses that have
 * rows — a status with no providers is absent from a `GROUP BY`, not zero —
 * and the tile has to render either way, so the gaps are filled here.
 */
export class CountProvidersByStatusProjection implements CountProvidersByStatusPort {
  constructor(private readonly repo: ProviderAdminRepositoryPort) {}

  async execute(): Promise<ProviderStatusCountsDTO> {
    const counts = await this.repo.countByStatus();
    return {
      pending: counts[ProviderStatus.Pending] ?? 0,
      active: counts[ProviderStatus.Active] ?? 0,
      rejected: counts[ProviderStatus.Rejected] ?? 0,
      suspended: counts[ProviderStatus.Suspended] ?? 0,
      archived: counts[ProviderStatus.Archived] ?? 0,
    };
  }
}
