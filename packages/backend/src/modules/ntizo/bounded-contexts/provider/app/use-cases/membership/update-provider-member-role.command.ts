import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  UpdateProviderMemberRoleInput,
  UpdateProviderMemberRoleOutput,
  UpdateProviderMemberRolePort,
} from "../../ports/inbound/membership";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import { ProviderMemberRoleUpdated } from "../../../domain/events";
import {
  MemberNotFoundError,
  NotProviderOwnerError,
  ProviderNotFoundError,
} from "../../../domain/exceptions";

export class UpdateProviderMemberRoleCommand
  implements UpdateProviderMemberRolePort
{
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: UpdateProviderMemberRoleInput,
  ): Promise<UpdateProviderMemberRoleOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);
    provider.assertSupportsMembers();

    // Owner role cannot be reassigned through this use case.
    if (input.userId === provider.ownerUserId || input.role === "owner") {
      throw new NotProviderOwnerError(provider.id, input.userId);
    }

    // Only the owner can change member roles (admins promote/demote is
    // intentionally restricted for now).
    provider.assertOwnedBy(requester.userId);

    const member = await this.memberRepo.findByProviderAndUser(
      provider.id,
      input.userId,
    );
    if (!member) throw new MemberNotFoundError(provider.id, input.userId);

    member.changeRole(input.role);
    await this.memberRepo.save(member);

    provider.recordEvent(
      new ProviderMemberRoleUpdated({
        providerId: provider.id,
        userId: input.userId,
        role: input.role,
      }),
    );
    // TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
    provider.pullEvents();

    return {
      providerId: provider.id,
      userId: input.userId,
      role: input.role,
    };
  }
}
