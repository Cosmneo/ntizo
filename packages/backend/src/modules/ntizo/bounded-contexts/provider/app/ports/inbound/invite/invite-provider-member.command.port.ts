import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";
import type { ProviderInviteRole } from "../../../../domain/entities/provider-invite";

export interface InviteProviderMemberInput {
  providerId: string;
  email: string;
  role: ProviderInviteRole;
}

export interface InviteProviderMemberOutput {
  inviteId: string;
  token: string;
  /**
   * False when the invitation was created but its email did not go out.
   *
   * The row exists either way — this says whether the person will ever hear
   * about it. Reported rather than thrown, because the invite is already
   * committed by the time the send is attempted: failing the mutation would
   * claim nothing happened while something did, and the obvious response,
   * trying again, mints a second invitation.
   */
  emailSent: boolean;
}

export interface InviteProviderMemberPort {
  execute(
    ctx: ExecutionContext,
    input: InviteProviderMemberInput,
  ): Promise<InviteProviderMemberOutput>;
}
