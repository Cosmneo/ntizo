import type {
  ProfileRepositoryPort,
  UserRepositoryPort,
} from "../ports/outbound";
import type { GetCurrentUserPort } from "../ports/inbound";
import type { CurrentUserDTO } from "@ntizo/shared";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../shared/infrastructure/execution-context";

export class GetCurrentUserUseCase implements GetCurrentUserPort {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly profileRepo: ProfileRepositoryPort,
  ) {}

  async execute(ctx: ExecutionContext): Promise<CurrentUserDTO | null> {
    const requester = requireAuthenticated(ctx);
    const user = await this.userRepo.findById(requester.userId);
    if (!user) return null;
    const profile = await this.profileRepo.findByUserId(requester.userId);

    const firstName = profile?.firstName ?? "";
    const lastName = profile?.lastName ?? "";
    const displayName = profile?.displayName ?? `${firstName} ${lastName}`.trim();

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      name: displayName,
      firstName,
      lastName,
      displayName,
      avatarUrl: profile?.avatarUrl ?? null,
      phoneNumber: profile?.phoneNumber ?? null,
      bio: profile?.bio ?? null,
      language: profile?.language ?? "en-US",
      timezone: profile?.timezone ?? "UTC",
    };
  }
}
