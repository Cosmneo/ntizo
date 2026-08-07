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
}

export interface InviteProviderMemberPort {
  execute(
    ctx: ExecutionContext,
    input: InviteProviderMemberInput,
  ): Promise<InviteProviderMemberOutput>;
}
