import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type {
  GetCurrentUserProjectionPort,
  ListMyAddressesPort,
} from "../../app/ports/inbound";
import { userReadSchema } from "../schema/queries";
import { mapGetCurrentUserInput, mapListMyAddressesInput } from "./arg-mappers";

export interface UserReadModule {
  readonly getCurrentUser: GetCurrentUserProjectionPort;
  readonly listMyAddresses: ListMyAddressesPort;
}

export function createUserReadHandlers(readModule: UserReadModule) {
  return graphqlRoutes(userReadSchema)
    .handleWithUseCase("user.me", {
      argsMapper: (_args, ctx) => mapGetCurrentUserInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.getCurrentUser,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("user.myAddresses", {
      // Same rule as above: the owner comes from the session, and the args
      // carry nothing this handler reads.
      argsMapper: (_args, ctx) => mapListMyAddressesInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.listMyAddresses,
      responseMapper: (output) => output,
    })
    .build();
}
