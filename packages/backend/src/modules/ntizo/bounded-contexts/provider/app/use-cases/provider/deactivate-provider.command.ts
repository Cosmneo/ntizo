import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
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
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export class DeactivateProviderCommand implements DeactivateProviderPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

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

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
