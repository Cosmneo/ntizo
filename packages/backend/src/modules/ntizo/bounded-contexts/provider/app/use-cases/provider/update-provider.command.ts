import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
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
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { Address } from "../../../domain/value-objects/address.vo";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export class UpdateProviderCommand implements UpdateProviderPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
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
      logoKey: input.logoKey,
      photoKeys: input.photoKeys,
      timezone: input.timezone,
    });

    // Its own method rather than another field on `update()`: it is the one
    // thing here with a rule of its own — a card cannot be credited — and
    // folding it in would put that rule behind a call that does five other
    // things. Only when the caller said something about it.
    if (input.payoutType !== undefined || input.payoutIdentifier !== undefined) {
      provider.setPayoutDestination(
        input.payoutType ?? null,
        input.payoutIdentifier ?? null,
      );
    }

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
