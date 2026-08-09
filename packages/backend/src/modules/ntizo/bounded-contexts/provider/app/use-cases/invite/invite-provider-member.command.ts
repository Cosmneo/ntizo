import { randomBytes, randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  InviteProviderMemberInput,
  InviteProviderMemberOutput,
  InviteProviderMemberPort,
} from "../../ports/inbound/invite";
import type {
  EmailServicePort,
  ProviderInviteRepositoryPort,
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { ProviderInvite } from "../../../domain/entities/provider-invite";
import {
  ProviderInviteSent,
} from "../../../domain/events";
import { ProviderNotFoundError } from "../../../domain/exceptions";

const INVITE_TTL_DAYS = 7;

export class InviteProviderMemberCommand implements InviteProviderMemberPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly inviteRepo: ProviderInviteRepositoryPort,
    private readonly emailService: EmailServicePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: InviteProviderMemberInput,
  ): Promise<InviteProviderMemberOutput> {
    const requester = requireAuthenticated(ctx);

    const provider = await this.providerRepo.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    // Only org-type providers support members/invites.
    provider.assertSupportsMembers();

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

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const token = randomBytes(24).toString("hex");

    const invite = ProviderInvite.create({
      id: randomUUID(),
      providerId: provider.id,
      email: input.email,
      role: input.role,
      token,
      expiresAt,
    });

    await this.unitOfWork.atomicExecute(async () => {
      await this.inviteRepo.save(invite);

      provider.recordEvent(
        new ProviderInviteSent({
          providerId: provider.id,
          inviteId: invite.id,
          email: invite.email,
          role: invite.role,
        }),
      );
      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    // Sent only once the invite row + event are durably committed — an email
    // for an invite that got rolled back would be worse than none.
    await this.emailService.sendEmail({
      to: [invite.email],
      subject: `You've been invited to join ${provider.name} on Ntizo`,
      htmlBody: buildInviteHtml({
        providerName: provider.name,
        inviterName: requester.email,
        token,
      }),
      textBody: `You've been invited to join ${provider.name} on Ntizo. Use this token: ${token}`,
    });

    return { inviteId: invite.id, token };
  }
}

function buildInviteHtml(params: {
  providerName: string;
  inviterName: string;
  token: string;
}): string {
  return `<p>${params.inviterName} invited you to join <strong>${params.providerName}</strong> on Ntizo.</p>
<p>Use this token to accept the invite: <code>${params.token}</code></p>`;
}
