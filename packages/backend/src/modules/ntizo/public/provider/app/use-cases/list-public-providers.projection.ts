import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ListPublicProvidersInput, ListPublicProvidersPort } from "../ports/inbound";
import type { ProviderPublicRepositoryPort } from "../ports/outbound/provider-public.repository.port";

/** Hard ceiling on page size — an anonymous endpoint must not let a caller ask for everything. */
export const MAX_PUBLIC_PAGE_SIZE = 50;

export class ListPublicProvidersProjection implements ListPublicProvidersPort {
  constructor(private readonly repo: ProviderPublicRepositoryPort) {}

  async execute(input: ListPublicProvidersInput): Promise<ProviderPublicDTO[]> {
    // Clamped here rather than trusted from the schema: the schema bound is a
    // contract, this is the enforcement. An unauthenticated endpoint is the
    // one place where "the client wouldn't do that" is not an argument.
    const limit = Math.min(Math.max(input.limit, 1), MAX_PUBLIC_PAGE_SIZE);
    const offset = Math.max(input.offset, 0);
    // Whitespace-only is treated as no filter, not as a search for spaces —
    // otherwise a stray space in the URL empties the directory.
    const search = input.search?.trim() || undefined;
    return this.repo.listActive(limit, offset, search);
  }
}
