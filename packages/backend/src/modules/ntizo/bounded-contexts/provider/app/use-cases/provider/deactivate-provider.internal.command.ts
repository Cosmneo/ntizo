import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type {
  DeactivateProviderInternalPort,
  DeactivateProviderInternalInput,
  DeactivateProviderInternalOutput,
} from "../../ports/inbound/provider/deactivate-provider.internal.command.port";
import type { ProviderRepositoryPort } from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderNotFoundError } from "../../../domain/exceptions";

/**
 * INTERNAL compensation command — deactivates a provider without the
 * owner-check the public command performs. Used by the register-as-provider
 * saga when a downstream step fails after provider creation.
 */
export class DeactivateProviderInternalCommand
  implements DeactivateProviderInternalPort
{
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    input: DeactivateProviderInternalInput,
  ): Promise<DeactivateProviderInternalOutput> {
    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    provider.deactivate();

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
