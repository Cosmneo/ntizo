import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface AcceptProviderInviteInput {
  token: string;
}

export interface AcceptProviderInviteOutput {
  providerId: string;
  memberId: string;
}

export interface AcceptProviderInvitePort {
  execute(
    ctx: ExecutionContext,
    input: AcceptProviderInviteInput,
  ): Promise<AcceptProviderInviteOutput>;
}
