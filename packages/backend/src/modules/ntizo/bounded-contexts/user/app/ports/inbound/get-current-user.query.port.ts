import type { CurrentUserDTO } from "@ntizo/shared";
import type { ExecutionContext } from "../../../../../shared/infrastructure/execution-context";

export interface GetCurrentUserPort {
  execute(ctx: ExecutionContext): Promise<CurrentUserDTO | null>;
}
