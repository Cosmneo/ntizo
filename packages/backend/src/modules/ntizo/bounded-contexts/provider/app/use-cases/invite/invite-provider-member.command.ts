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
import { infraStore } from "../../../../../../../shared/infrastructure/stores/infra-store";
import { buildProviderInviteEmail } from "../../../../../../../shared/infrastructure/email/templates/provider-invite.template";
import type {
  EmailServicePort,
  InviterLocalePort,
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
    private readonly inviterLocale: InviterLocalePort,
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
      invitedByUserId: requester.userId,
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
    // In the inviter's language. The recipient has no account yet, so that is
    // the only signal available — and a colleague inviting a colleague almost
    // always shares one.
    const locale = await this.inviterLocale.localeFor(requester.userId);
    const appUrl = infraStore.getEnv().APP_URL.replace(/\/+$/, "");
    const mail = buildProviderInviteEmail({
      providerName: provider.name,
      inviterName: requester.email,
      role: invite.role,
      // The link the email exists to carry. The version this replaces sent a
      // 48-character hex token in a paragraph and nothing to click.
      acceptUrl: `${appUrl}/accept-invite/${token}`,
      expiresInDays: INVITE_TTL_DAYS,
      ...(locale ? { locale } : {}),
    });

    // Reported, not thrown. The invite row and its event are already durably
    // committed by this point, so a mail failure that rejected the mutation
    // would tell the caller nothing happened while something did — and the
    // obvious response, trying again, mints a second invitation.
    //
    // Silence would be worse in the other direction: the invitee is never
    // going to hear about it. So the outcome travels back and the UI says so.
    let emailSent = true;
    try {
      await this.emailService.sendEmail({
        to: [invite.email],
        subject: mail.subject,
        htmlBody: mail.html,
        textBody: mail.text,
      });
    } catch (error) {
      emailSent = false;
      console.error("[invite] the invitation email did not send", {
        inviteId: invite.id,
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { inviteId: invite.id, token, emailSent };
  }
}
