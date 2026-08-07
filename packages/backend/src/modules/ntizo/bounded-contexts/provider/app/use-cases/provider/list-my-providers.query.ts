import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  ListMyProvidersPort,
  ListMyProvidersOutput,
} from "../../ports/inbound/provider/list-my-providers.query.port";
import type { ProviderRepositoryPort } from "../../ports/outbound";

export class ListMyProvidersQuery implements ListMyProvidersPort {
  constructor(private readonly providerRepo: ProviderRepositoryPort) {}

  async execute(ctx: ExecutionContext): Promise<ListMyProvidersOutput> {
    const requester = requireAuthenticated(ctx);
    return this.providerRepo.findListItemsForUser(requester.userId);
  }
}
