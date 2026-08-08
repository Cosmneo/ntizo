import type { CurrentUserDTO } from "@ntizo/shared";

export interface UserReadRepositoryPort {
  findCurrentUser(userId: string): Promise<CurrentUserDTO | null>;
}
