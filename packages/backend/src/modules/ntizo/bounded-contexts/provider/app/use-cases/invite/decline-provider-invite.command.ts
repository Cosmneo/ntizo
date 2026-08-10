import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  DeclineProviderInviteInput,
  DeclineProviderInviteOutput,
  DeclineProviderInvitePort,
} from "../../ports/inbound/invite";
import type {
  ProviderInviteRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderInviteDeclined } from "../../../domain/events";
import { InviteNotFoundError, ProviderNotFoundError } from "../../../domain/exceptions";

/**
 * Turning an invitation down.
 *
 * The invitee decides, so holding the token is the authorisation — the same
 * proof accepting requires, and the only one someone who has never had an
 * account can produce. A signed-in session is required on top of it because
 * every mutation on this API is, and because a declined invitation is a
 * decision worth being able to attribute.
 *
 * Deliberately *not* modelled as a revoke. Revoked is the workspace
 * withdrawing an offer; declined is the person refusing one. An admin reading
 * the list needs to tell those apart: one means "I changed my mind", the other
 * means "they said no", and only the second is a reason not to send it again.
 *
 * `markDeclinedIfPending` rather than a blind save, for the reason spelled out
 * at length in `accept-provider-invite.command.ts`: the invite is read before
 * the transaction opens, so a concurrent revoke or accept can commit in
 * between, and a blind write would stamp this process's stale copy over it.
 * A no-op is the correct outcome there — somebody else resolved it first — and
 * `declined: false` says so rather than claiming success.
 */
export class DeclineProviderInviteCommand implements DeclineProviderInvitePort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly inviteRepo: ProviderInviteRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: DeclineProviderInviteInput,
  ): Promise<DeclineProviderInviteOutput> {
    requireAuthenticated(ctx);

    const invite = await this.inviteRepo.findByToken(input.token);
    if (!invite) throw new InviteNotFoundError(input.token);

    // Not `assertUsable()`. That throws on an expired or already-resolved
    // invitation, and there is nothing to warn someone about here: they were
    // declining it anyway, and an error page telling them their refusal failed
    // is a worse answer than "yes, it is not going to happen".
    if (invite.status !== "pending") return { declined: false };

    const provider = await this.providerRepo.findById(invite.providerId);
    if (!provider) throw new ProviderNotFoundError(invite.providerId);

    let declined = false;
    await this.unitOfWork.atomicExecute(async () => {
      declined = await this.inviteRepo.markDeclinedIfPending(invite.id);
      if (!declined) return;

      invite.markDeclined();
      provider.recordEvent(
        new ProviderInviteDeclined({
          providerId: provider.id,
          inviteId: invite.id,
          email: invite.email,
        }),
      );
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { declined };
  }
}
