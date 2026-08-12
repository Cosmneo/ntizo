import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface RemoveProviderMemberInput {
  providerId: string;
  userId: string;
}

export interface RemoveProviderMemberOutput {
  providerId: string;
  userId: string;
  /**
   * Every published service this removal left with no performers, unpublished
   * and named back so the caller can tell the owner what changed. Empty when
   * nothing was affected — the common case.
   */
  unpublishedServices: { serviceId: string; name: string }[];
}

export interface RemoveProviderMemberPort {
  execute(
    ctx: ExecutionContext,
    input: RemoveProviderMemberInput,
  ): Promise<RemoveProviderMemberOutput>;
}
