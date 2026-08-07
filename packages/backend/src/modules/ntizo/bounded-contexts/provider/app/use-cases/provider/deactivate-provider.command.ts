import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  DeactivateProviderInput,
  DeactivateProviderOutput,
  DeactivateProviderPort,
} from "../../ports/inbound/provider";
import type { ProviderRepositoryPort } from "../../ports/outbound";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export class DeactivateProviderCommand implements DeactivateProviderPort {
  constructor(private readonly providerRepo: ProviderRepositoryPort) {}

  async execute(
    ctx: ExecutionContext,
    input: DeactivateProviderInput,
  ): Promise<DeactivateProviderOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    // Only the owner can suspend their provider.
    provider.assertOwnedBy(requester.userId);
    provider.deactivate();

    await this.providerRepo.save(provider);
    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return { providerId: provider.id };
  }
}
