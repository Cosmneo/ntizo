// User BC bootstrap — wires adapters into use cases.

import { DrizzleUserRepository } from "../infrastructure/repositories/drizzle-user.repository";
import { DrizzleProfileRepository } from "../infrastructure/repositories/drizzle-profile.repository";
import { UpgradeProfileToProviderInternalCommand } from "../app/use-cases/upgrade-profile-to-provider.internal.command";
import { RevertProviderUpgradeInternalCommand } from "../app/use-cases/revert-provider-upgrade.internal.command";
import { CreateUserOnSignUpInternalCommand } from "../app/use-cases/create-user-on-sign-up.internal.command";
import { UpdateMyProfileCommand } from "../app/use-cases/update-my-profile.command";
import {
  AddMyAddressCommand,
  DeleteMyAddressCommand,
  UpdateMyAddressCommand,
} from "../app/use-cases/manage-my-addresses.command";
import { DrizzleAddressRepository } from "../infrastructure/repositories/drizzle-address.repository";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export function bootstrapUser() {
  const userRepository = new DrizzleUserRepository();
  const profileRepository = new DrizzleProfileRepository();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  const upgradeProfileToProvider = new UpgradeProfileToProviderInternalCommand(
    userRepository,
  );
  const revertProviderUpgrade = new RevertProviderUpgradeInternalCommand(
    userRepository,
  );
  const createUserOnSignUp = new CreateUserOnSignUpInternalCommand(
    userRepository,
    profileRepository,
    unitOfWork,
    outboxPort,
  );

  const updateMyProfile = new UpdateMyProfileCommand(profileRepository, unitOfWork);

  const addressRepository = new DrizzleAddressRepository();
  const addMyAddress = new AddMyAddressCommand(addressRepository, unitOfWork);
  const updateMyAddress = new UpdateMyAddressCommand(addressRepository, unitOfWork);
  const deleteMyAddress = new DeleteMyAddressCommand(addressRepository, unitOfWork);

  return {
    adapters: {
      userRepository,
      profileRepository,
      addressRepository,
      unitOfWork,
      outboxPort,
    },
    useCases: {
      updateMyProfile,
      addMyAddress,
      updateMyAddress,
      deleteMyAddress,
      internal: {
        upgradeProfileToProvider,
        revertProviderUpgrade,
        createUserOnSignUp,
      },
    },
  };
}

export type UserBootstrap = ReturnType<typeof bootstrapUser>;
