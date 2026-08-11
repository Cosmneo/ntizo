import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type { ProviderRepositoryPort } from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export interface SetProviderCommissionInput {
  providerId: string;
  /** Basis points. 1000 is 10%. */
  commissionBps: number;
}

/**
 * An administrator changing what a business is charged.
 *
 * No ownership assertion, for the same reason `DecideProviderStatusCommand`
 * has none: the person doing this is not a member of the business. The whole
 * security surface of that omission is the admin check at the GraphQL edge —
 * and this one matters more than most, because the field it writes is the one
 * the provider is deliberately not allowed to touch.
 *
 * The range check is the aggregate's, not this command's: `setCommissionByAdmin`
 * refuses anything outside 0–10000 and anything fractional, and a second copy
 * of that rule here would be a second place for it to drift.
 */
export class SetProviderCommissionCommand {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: SetProviderCommissionInput,
  ): Promise<{ providerId: string }> {
    requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    provider.setCommissionByAdmin(input.commissionBps);

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
