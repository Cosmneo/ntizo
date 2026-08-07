import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  UpdateProviderInput,
  UpdateProviderOutput,
  UpdateProviderPort,
} from "../../ports/inbound/provider";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import { Address } from "../../../domain/value-objects/address.vo";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export class UpdateProviderCommand implements UpdateProviderPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: UpdateProviderInput,
  ): Promise<UpdateProviderOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    // Owner or admin members can update.
    const member = await this.memberRepo.findByProviderAndUser(
      provider.id,
      requester.userId,
    );
    provider.assertCanManage(
      requester.userId,
      member?.role === "admin" ? "admin" : member?.role === "staff" ? "staff" : undefined,
    );

    provider.update({
      name: input.name,
      description: input.description,
      address: input.address ? Address.create(input.address) : undefined,
    });

    await this.providerRepo.save(provider);
    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return { providerId: provider.id };
  }
}
