import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface RevokeProviderInviteInput {
  providerId: string;
  inviteId: string;
}

export interface RevokeProviderInviteOutput {
  inviteId: string;
}

export interface RevokeProviderInvitePort {
  execute(
    ctx: ExecutionContext,
    input: RevokeProviderInviteInput,
  ): Promise<RevokeProviderInviteOutput>;
}
