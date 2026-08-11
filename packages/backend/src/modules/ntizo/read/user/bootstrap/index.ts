import { DrizzleUserReadRepository } from "../infra/repositories/drizzle/user-read.repository";
import { ListUsersForAdminProjection } from "../app/use-cases/list-users-for-admin.projection";
import { DrizzleUserAdminRepository } from "../infra/repositories/drizzle/user-admin.repository";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import { DrizzleAddressReadRepository } from "../infra/repositories/drizzle/address-read.repository";
import { ListMyAddressesProjection } from "../app/use-cases/list-my-addresses.projection";
import type { UserReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapUserRead(): {
  adapters: {
    userReadRepository: DrizzleUserReadRepository;
    addressReadRepository: DrizzleAddressReadRepository;
  };
  useCases: UserReadModule;
} {
  const userReadRepository = new DrizzleUserReadRepository();
  const addressReadRepository = new DrizzleAddressReadRepository();
  const userAdminRepository = new DrizzleUserAdminRepository();
  return {
    adapters: { userReadRepository, addressReadRepository },
    useCases: {
      getCurrentUser: new GetCurrentUserProjection(userReadRepository),
      listMyAddresses: new ListMyAddressesProjection(addressReadRepository),
      listUsersForAdmin: new ListUsersForAdminProjection(userAdminRepository),
    },
  };
}

export type UserReadBootstrap = ReturnType<typeof bootstrapUserRead>;
