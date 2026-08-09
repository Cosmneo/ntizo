import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  RemoveProviderMemberInput,
  RemoveProviderMemberOutput,
  RemoveProviderMemberPort,
} from "../../ports/inbound/membership";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderMemberRemoved } from "../../../domain/events";
import {
  MemberNotFoundError,
  NotProviderOwnerError,
  ProviderNotFoundError,
} from "../../../domain/exceptions";

export class RemoveProviderMemberCommand implements RemoveProviderMemberPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: RemoveProviderMemberInput,
  ): Promise<RemoveProviderMemberOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);
    provider.assertSupportsMembers();

    // Can't remove the owner.
    if (input.userId === provider.ownerUserId) {
      throw new NotProviderOwnerError(provider.id, input.userId);
    }

    const requesterMember = await this.memberRepo.findByProviderAndUser(
      provider.id,
      requester.userId,
    );
    provider.assertCanManage(
      requester.userId,
      requesterMember?.role === "admin"
        ? "admin"
        : requesterMember?.role === "staff"
          ? "staff"
          : undefined,
    );

    const target = await this.memberRepo.findByProviderAndUser(
      provider.id,
      input.userId,
    );
    if (!target) throw new MemberNotFoundError(provider.id, input.userId);

    await this.unitOfWork.atomicExecute(async () => {
      await this.memberRepo.delete(provider.id, input.userId);

      provider.recordEvent(
        new ProviderMemberRemoved({
          providerId: provider.id,
          userId: input.userId,
        }),
      );
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id, userId: input.userId };
  }
}
