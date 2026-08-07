import type {
  ProfileRepositoryPort,
  UserRepositoryPort,
} from "../ports/outbound";
import type {
  CreateUserOnSignUpInternalInput,
  CreateUserOnSignUpInternalPort,
} from "../ports/inbound/create-user-on-sign-up.internal.command.port";
import { User } from "../../domain/aggregates/user.aggregate";
import { Profile } from "../../domain/aggregates/profile.aggregate";

/**
 * Internal command — called from the better-auth `user.create.after` hook.
 * Idempotent: if a user already exists for this id (e.g. on retry), no-op.
 */
export class CreateUserOnSignUpInternalCommand
  implements CreateUserOnSignUpInternalPort
{
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly profileRepo: ProfileRepositoryPort,
  ) {}

  async execute(input: CreateUserOnSignUpInternalInput): Promise<void> {
    const existing = await this.userRepo.findById(input.userId);
    if (existing) return;

    const user = User.create({
      id: input.userId,
      email: input.email,
      role: "customer",
    });
    await this.userRepo.save(user);

    const profile = Profile.create({
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    await this.profileRepo.save(profile);
  }
}
