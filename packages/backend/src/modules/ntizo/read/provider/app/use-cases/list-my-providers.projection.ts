import type { ProviderListItemDTO } from "@ntizo/shared/read-models";
import type {
  ListMyProvidersProjectionInput,
  ListMyProvidersProjectionPort,
} from "../ports/inbound";
import type { ProviderReadRepositoryPort } from "../ports/outbound/provider-read.repository.port";

export class ListMyProvidersProjection implements ListMyProvidersProjectionPort {
  constructor(private readonly repo: ProviderReadRepositoryPort) {}

  async execute(
    input: ListMyProvidersProjectionInput,
  ): Promise<ProviderListItemDTO[]> {
    if (!input.requestedByUserId) return [];
    return this.repo.listForUser(input.requestedByUserId);
  }
}
