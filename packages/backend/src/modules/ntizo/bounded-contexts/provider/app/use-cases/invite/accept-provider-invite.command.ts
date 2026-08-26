import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
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
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderMember } from "../../../domain/entities/provider-member";
import {
  ProviderInviteAccepted,
  ProviderMemberAdded,
} from "../../../domain/events";
import {
  InviteAlreadyUsedError,
  InviteNotFoundError,
  MemberAlreadyExistsError,
  ProviderNotFoundError,
} from "../../../domain/exceptions";

/**
 * Concurrency note: `atomicExecute` below makes the member insert and the
 * invite transition all-or-nothing — it does NOT by itself make the
 * accept-vs-revoke race safe. The invite is read and validated
 * (`assertUsable()`) *before* the transaction opens, per this BC's rule of
 * keeping authorization/validation reads outside the wrapped writes. That
 * leaves a window: another request can revoke the same invite and commit
 * before this one reaches its transaction. A blind `inviteRepo.save(invite)`
 * would overwrite that committed "revoked" status back to "accepted" with
 * the stale in-memory copy — the write would be atomic (both rows or
 * neither) but not correct. `markAcceptedIfPending` closes that window: it's
 * a conditional `UPDATE ... WHERE status = 'pending'`, so Postgres itself
 * re-checks the invite's current status at write time and reports back
 * whether the transition actually happened, rather than trusting what this
 * process read minutes/microseconds ago.
 */
export class AcceptProviderInviteCommand implements AcceptProviderInvitePort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly inviteRepo: ProviderInviteRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
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

    await this.unitOfWork.atomicExecute(async () => {
      await this.memberRepo.save(member);

      // Conditional, not a blind upsert — see the class docblock. If the
      // invite was revoked (or accepted/expired) by someone else after our
      // `assertUsable()` read above, this affects zero rows and we must
      // abort: throwing here rolls back the member insert too, since both
      // are in the same atomicExecute.
      const accepted = await this.inviteRepo.markAcceptedIfPending(invite.id);
      if (!accepted) {
        throw new InviteAlreadyUsedError(input.token);
      }
      invite.markAccepted();

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
          // The invitee accepting, not the inviter who sent it —
          // `requester` here is whoever is authenticated on this request,
          // and this command is only ever called by the person accepting.
          actorUserId: requester.userId,
        }),
      );
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id, memberId: member.id };
  }
}
