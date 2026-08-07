import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";
import type { ProviderMemberRole } from "../../../../domain/entities/provider-member";

export interface UpdateProviderMemberRoleInput {
  providerId: string;
  userId: string;
  role: ProviderMemberRole;
}

export interface UpdateProviderMemberRoleOutput {
  providerId: string;
  userId: string;
  role: ProviderMemberRole;
}

export interface UpdateProviderMemberRolePort {
  execute(
    ctx: ExecutionContext,
    input: UpdateProviderMemberRoleInput,
  ): Promise<UpdateProviderMemberRoleOutput>;
}
