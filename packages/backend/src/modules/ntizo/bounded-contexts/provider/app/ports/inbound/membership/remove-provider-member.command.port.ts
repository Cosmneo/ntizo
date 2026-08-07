import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface RemoveProviderMemberInput {
  providerId: string;
  userId: string;
}

export interface RemoveProviderMemberOutput {
  providerId: string;
  userId: string;
}

export interface RemoveProviderMemberPort {
  execute(
    ctx: ExecutionContext,
    input: RemoveProviderMemberInput,
  ): Promise<RemoveProviderMemberOutput>;
}
