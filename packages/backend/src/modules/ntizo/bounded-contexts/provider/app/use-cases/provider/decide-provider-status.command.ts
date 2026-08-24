import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { ProviderStatus } from "@ntizo/shared";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type { ProviderRepositoryPort } from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderNotFoundError } from "../../../domain/exceptions";

export interface DecideProviderStatusInput {
  providerId: string;
  status: ProviderStatus;
}

export interface DecideProviderStatusOutput {
  providerId: string;
}

/**
 * An administrator's decision on whether a provider may trade.
 *
 * No ownership assertion, unlike every other command in this context. An admin
 * is not a member of the business they are deciding on, and calling
 * `assertOwnedBy` here would make the review queue unusable by the only people
 * meant to use it.
 *
 * That omission is the whole security surface of this command, so it is worth
 * being explicit about where the check moved to rather than disappeared:
 * `requireAdminUserId` at the GraphQL edge. This command still requires an
 * authenticated caller — it needs the id to record who decided — but it does
 * not decide who may call it.
 *
 * Which moves are legal is the aggregate's rule, not this one's.
 */
export class DecideProviderStatusCommand {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: DecideProviderStatusInput,
  ): Promise<DecideProviderStatusOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    provider.decide(input.status, requester.userId);

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
