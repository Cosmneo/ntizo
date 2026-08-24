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
  CatalogRepositoryPort,
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
    private readonly catalogRepo: CatalogRepositoryPort,
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

    let unpublishedServices: { serviceId: string; name: string }[] = [];

    await this.unitOfWork.atomicExecute(async () => {
      await this.memberRepo.delete(provider.id, input.userId);

      // The FK on `service_member.member_id` cascades away this member's
      // rows in the same transaction, above. A published service left with
      // nobody to perform it cannot stay live — that rule has no foreign key
      // to express it, so it runs here instead, inside the same atomic block
      // so a member's departure and the services it un-lists land together
      // or not at all.
      unpublishedServices = await this.catalogRepo.unpublishServicesWithoutMembers(
        provider.id,
      );

      provider.recordEvent(
        new ProviderMemberRemoved({
          providerId: provider.id,
          userId: input.userId,
        }),
      );
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id, userId: input.userId, unpublishedServices };
  }
}
