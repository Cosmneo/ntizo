import type { ProviderAdminDTO } from "@ntizo/shared/read-models";
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

export class CountProvidersByStatusProjection implements CountProvidersByStatusPort {
  constructor(private readonly repo: ProviderAdminRepositoryPort) {}

  execute(): Promise<Record<string, number>> {
    return this.repo.countByStatus();
  }
}
