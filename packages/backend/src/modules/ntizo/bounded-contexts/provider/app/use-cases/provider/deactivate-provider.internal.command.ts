import type {
  DeactivateProviderInternalPort,
  DeactivateProviderInternalInput,
  DeactivateProviderInternalOutput,
} from "../../ports/inbound/provider/deactivate-provider.internal.command.port";
import type { ProviderRepositoryPort } from "../../ports/outbound";
import { ProviderNotFoundError } from "../../../domain/exceptions";

/**
 * INTERNAL compensation command — deactivates a provider without the
 * owner-check the public command performs. Used by the register-as-provider
 * saga when a downstream step fails after provider creation.
 */
export class DeactivateProviderInternalCommand
  implements DeactivateProviderInternalPort
{
  constructor(private readonly providerRepo: ProviderRepositoryPort) {}

  async execute(
    input: DeactivateProviderInternalInput,
  ): Promise<DeactivateProviderInternalOutput> {
    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    provider.deactivate();
    await this.providerRepo.save(provider);
    // TODO(ntizo): dispatch compensation event via outbox.
    provider.pullEvents();

    return { providerId: provider.id };
  }
}
