import { DrizzleUserReadRepository } from "../infra/repositories/drizzle/user-read.repository";
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
  return {
    adapters: { userReadRepository, addressReadRepository },
    useCases: {
      getCurrentUser: new GetCurrentUserProjection(userReadRepository),
      listMyAddresses: new ListMyAddressesProjection(addressReadRepository),
    },
  };
}

export type UserReadBootstrap = ReturnType<typeof bootstrapUserRead>;
