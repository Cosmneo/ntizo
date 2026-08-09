import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type {
  CreateProviderInternalPort,
  CreateProviderInternalInput,
  CreateProviderInternalOutput,
} from "../../ports/inbound/provider/create-provider.internal.command.port";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../domain/aggregates/provider";
import { Address } from "../../../domain/value-objects/address.vo";
import { ProviderMember } from "../../../domain/entities/provider-member";
import { ProviderMemberAdded } from "../../../domain/events";

/**
 * INTERNAL create-provider command — mirrors CreateProviderCommand but
 * accepts a raw `ownerUserId` and skips the ExecutionContext auth check
 * because the saga is calling on behalf of an already-authorized requester.
 */
export class CreateProviderInternalCommand implements CreateProviderInternalPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    input: CreateProviderInternalInput,
  ): Promise<CreateProviderInternalOutput> {
    const provider = Provider.create({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
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
        userId: input.ownerUserId,
        role: "owner",
      });
      await this.memberRepo.save(ownerMember);

      // Mirrors accept-provider-invite.command.ts: every member row must
      // have a matching event, so a future projection rebuilding
      // membership from the event stream sees the owner too — the one
      // member every provider is guaranteed to have.
      provider.recordEvent(
        new ProviderMemberAdded({
          providerId: provider.id,
          userId: input.ownerUserId,
          role: "owner",
        }),
      );

      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }
}
