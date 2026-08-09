import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  CreateProviderInput,
  CreateProviderOutput,
  CreateProviderPort,
} from "../../ports/inbound/provider";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import { Provider } from "../../../domain/aggregates/provider";
import { Address } from "../../../domain/value-objects/address.vo";
import { ProviderMember } from "../../../domain/entities/provider-member";

export class CreateProviderCommand implements CreateProviderPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: CreateProviderInput,
  ): Promise<CreateProviderOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = Provider.create({
      id: randomUUID(),
      ownerUserId: requester.userId,
      type: input.type,
      name: input.name,
      slug: input.slug,
      description: input.description,
      address: input.address ? Address.create(input.address) : undefined,
    });

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);

      // Owner is always recorded as the first member, regardless of provider type.
      const ownerMember = ProviderMember.create({
        id: randomUUID(),
        providerId: provider.id,
        userId: requester.userId,
        role: "owner",
      });
      await this.memberRepo.save(ownerMember);
    });

    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return { providerId: provider.id };
  }
}
