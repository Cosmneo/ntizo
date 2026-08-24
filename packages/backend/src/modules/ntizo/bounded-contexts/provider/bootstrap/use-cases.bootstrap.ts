import type { ProviderAdapters } from "./adapters.bootstrap";
import { CreateProviderCommand } from "../app/use-cases/provider/create-provider.command";
import { UpdateProviderCommand } from "../app/use-cases/provider/update-provider.command";
import { DeactivateProviderCommand } from "../app/use-cases/provider/deactivate-provider.command";
import { CreateProviderInternalCommand } from "../app/use-cases/provider/create-provider.internal.command";
import { DecideProviderStatusCommand } from "../app/use-cases/provider/decide-provider-status.command";
import { SetProviderCommissionCommand } from "../app/use-cases/provider/set-provider-commission.command";
import { DeactivateProviderInternalCommand } from "../app/use-cases/provider/deactivate-provider.internal.command";
import { ListMyProvidersQuery } from "../app/use-cases/provider/list-my-providers.query";
import { InviteProviderMemberCommand } from "../app/use-cases/invite/invite-provider-member.command";
import { AcceptProviderInviteCommand } from "../app/use-cases/invite/accept-provider-invite.command";
import { DeclineProviderInviteCommand } from "../app/use-cases/invite/decline-provider-invite.command";
import { RevokeProviderInviteCommand } from "../app/use-cases/invite/revoke-provider-invite.command";
import { RemoveProviderMemberCommand } from "../app/use-cases/membership/remove-provider-member.command";
import { UpdateProviderMemberRoleCommand } from "../app/use-cases/membership/update-provider-member-role.command";

export function bootstrapUseCases(adapters: ProviderAdapters) {
  const {
    providerRepository,
    providerMemberRepository,
    providerInviteRepository,
    emailService,
    inviterLocale,
    walletRepository,
    platformSettings,
    unitOfWork,
    outboxPort,
    catalogRepository,
  } = adapters;

  return {
    createProvider: new CreateProviderCommand(
      providerRepository,
      providerMemberRepository,
      walletRepository,
      platformSettings,
      unitOfWork,
      outboxPort,
    ),
    updateProvider: new UpdateProviderCommand(
      providerRepository,
      providerMemberRepository,
      unitOfWork,
      outboxPort,
    ),
    deactivateProvider: new DeactivateProviderCommand(
      providerRepository,
      unitOfWork,
      outboxPort,
    ),

    // Both administrator-only, and neither asserts ownership — an admin is not
    // a member of the business they are deciding about. That omission is the
    // whole security surface of the two, and the check lives at the GraphQL
    // edge, which is the one place that sees the session.
    decideProviderStatus: new DecideProviderStatusCommand(
      providerRepository,
      unitOfWork,
      outboxPort,
    ),
    setProviderCommission: new SetProviderCommissionCommand(
      providerRepository,
      unitOfWork,
      outboxPort,
    ),

    listMyProviders: new ListMyProvidersQuery(providerRepository),

    inviteProviderMember: new InviteProviderMemberCommand(
      providerRepository,
      providerMemberRepository,
      providerInviteRepository,
      emailService,
      inviterLocale,
      unitOfWork,
      outboxPort,
    ),
    acceptProviderInvite: new AcceptProviderInviteCommand(
      providerRepository,
      providerMemberRepository,
      providerInviteRepository,
      unitOfWork,
      outboxPort,
    ),
    declineProviderInvite: new DeclineProviderInviteCommand(
      providerRepository,
      providerInviteRepository,
      unitOfWork,
      outboxPort,
    ),
    revokeProviderInvite: new RevokeProviderInviteCommand(
      providerRepository,
      providerMemberRepository,
      providerInviteRepository,
      unitOfWork,
      outboxPort,
    ),

    removeProviderMember: new RemoveProviderMemberCommand(
      providerRepository,
      providerMemberRepository,
      catalogRepository,
      unitOfWork,
      outboxPort,
    ),
    updateProviderMemberRole: new UpdateProviderMemberRoleCommand(
      providerRepository,
      providerMemberRepository,
      unitOfWork,
      outboxPort,
    ),

    // Internal commands — called by orchestration workflows only.
    internal: {
      createProvider: new CreateProviderInternalCommand(
        providerRepository,
        providerMemberRepository,
        walletRepository,
        platformSettings,
        unitOfWork,
        outboxPort,
      ),
      deactivateProvider: new DeactivateProviderInternalCommand(
        providerRepository,
        unitOfWork,
        outboxPort,
      ),
    },
  };
}

export type ProviderUseCases = ReturnType<typeof bootstrapUseCases>;
