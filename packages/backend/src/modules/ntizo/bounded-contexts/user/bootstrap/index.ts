// User BC bootstrap — wires adapters into use cases.

import { DrizzleUserRepository } from "../infrastructure/repositories/drizzle-user.repository";
import { DrizzleProfileRepository } from "../infrastructure/repositories/drizzle-profile.repository";
import { GetCurrentUserUseCase } from "../app/use-cases/get-current-user.use-case";
import { UpgradeProfileToProviderInternalCommand } from "../app/use-cases/upgrade-profile-to-provider.internal.command";
import { RevertProviderUpgradeInternalCommand } from "../app/use-cases/revert-provider-upgrade.internal.command";
import { CreateUserOnSignUpInternalCommand } from "../app/use-cases/create-user-on-sign-up.internal.command";

export function bootstrapUser() {
  const userRepository = new DrizzleUserRepository();
  const profileRepository = new DrizzleProfileRepository();

  const getCurrentUser = new GetCurrentUserUseCase(
    userRepository,
    profileRepository,
  );

  const upgradeProfileToProvider = new UpgradeProfileToProviderInternalCommand(
    userRepository,
  );
  const revertProviderUpgrade = new RevertProviderUpgradeInternalCommand(
    userRepository,
  );
  const createUserOnSignUp = new CreateUserOnSignUpInternalCommand(
    userRepository,
    profileRepository,
  );

  return {
    adapters: { userRepository, profileRepository },
    useCases: {
      getCurrentUser,
      internal: {
        upgradeProfileToProvider,
        revertProviderUpgrade,
        createUserOnSignUp,
      },
    },
  };
}

export type UserBootstrap = ReturnType<typeof bootstrapUser>;
