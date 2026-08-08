import type { CurrentUserDTO } from "@ntizo/shared";

export interface GetCurrentUserProjectionInput {
  requestedByUserId: string;
}

export interface GetCurrentUserProjectionPort {
  execute(input: GetCurrentUserProjectionInput): Promise<CurrentUserDTO>;
}
