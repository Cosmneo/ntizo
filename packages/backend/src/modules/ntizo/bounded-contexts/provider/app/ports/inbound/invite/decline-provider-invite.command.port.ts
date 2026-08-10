import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface DeclineProviderInviteInput {
  token: string;
}

export interface DeclineProviderInviteOutput {
  /** False when someone else already resolved it — accepted, revoked, expired. */
  declined: boolean;
}

export interface DeclineProviderInvitePort {
  execute(
    ctx: ExecutionContext,
    input: DeclineProviderInviteInput,
  ): Promise<DeclineProviderInviteOutput>;
}
