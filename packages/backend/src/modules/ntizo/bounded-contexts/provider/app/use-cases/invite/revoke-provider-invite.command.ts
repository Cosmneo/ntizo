import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  RevokeProviderInviteInput,
  RevokeProviderInviteOutput,
  RevokeProviderInvitePort,
} from "../../ports/inbound/invite";
import type {
  ProviderInviteRepositoryPort,
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import { ProviderInviteRevoked } from "../../../domain/events";
import {
  InviteNotFoundError,
  ProviderNotFoundError,
} from "../../../domain/exceptions";

export class RevokeProviderInviteCommand implements RevokeProviderInvitePort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly inviteRepo: ProviderInviteRepositoryPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: RevokeProviderInviteInput,
  ): Promise<RevokeProviderInviteOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

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

    const invite = await this.inviteRepo.findById(input.inviteId);
    if (!invite || invite.providerId !== provider.id) {
      throw new InviteNotFoundError(input.inviteId);
    }

    invite.markRevoked();
    await this.inviteRepo.save(invite);

    provider.recordEvent(
      new ProviderInviteRevoked({
        providerId: provider.id,
        inviteId: invite.id,
      }),
    );
    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return { inviteId: invite.id };
  }
}
