import { randomUUID } from "node:crypto";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  AcceptProviderInviteInput,
  AcceptProviderInviteOutput,
  AcceptProviderInvitePort,
} from "../../ports/inbound/invite";
import type {
  ProviderInviteRepositoryPort,
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import { ProviderMember } from "../../../domain/entities/provider-member";
import {
  ProviderInviteAccepted,
  ProviderMemberAdded,
} from "../../../domain/events";
import {
  InviteNotFoundError,
  MemberAlreadyExistsError,
  ProviderNotFoundError,
} from "../../../domain/exceptions";

export class AcceptProviderInviteCommand implements AcceptProviderInvitePort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly inviteRepo: ProviderInviteRepositoryPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: AcceptProviderInviteInput,
  ): Promise<AcceptProviderInviteOutput> {
    const requester = requireAuthenticated(ctx);

    const invite = await this.inviteRepo.findByToken(input.token);
    if (!invite) throw new InviteNotFoundError(input.token);

    invite.assertUsable();

    const provider = await this.providerRepo.findById(invite.providerId);
    if (!provider) throw new ProviderNotFoundError(invite.providerId);
    provider.assertSupportsMembers();

    const existing = await this.memberRepo.findByProviderAndUser(
      provider.id,
      requester.userId,
    );
    if (existing) {
      throw new MemberAlreadyExistsError(provider.id, requester.userId);
    }

    const member = ProviderMember.create({
      id: randomUUID(),
      providerId: provider.id,
      userId: requester.userId,
      role: invite.role,
    });
    await this.memberRepo.save(member);

    invite.markAccepted();
    await this.inviteRepo.save(invite);

    provider.recordEvent(
      new ProviderMemberAdded({
        providerId: provider.id,
        userId: requester.userId,
        role: invite.role,
      }),
    );
    provider.recordEvent(
      new ProviderInviteAccepted({
        providerId: provider.id,
        email: invite.email,
        userId: requester.userId,
      }),
    );
    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return { providerId: provider.id, memberId: member.id };
  }
}
