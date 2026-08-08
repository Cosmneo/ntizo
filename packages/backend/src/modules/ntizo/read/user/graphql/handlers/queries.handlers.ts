import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { GetCurrentUserProjectionPort } from "../../app/ports/inbound";
import { userReadSchema } from "../schema/queries";
import { mapGetCurrentUserInput } from "./arg-mappers";

export interface UserReadModule {
  readonly getCurrentUser: GetCurrentUserProjectionPort;
}

export function createUserReadHandlers(readModule: UserReadModule) {
  return graphqlRoutes(userReadSchema)
    .handleWithUseCase("user.me", {
      argsMapper: (_args, ctx) => mapGetCurrentUserInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.getCurrentUser,
      responseMapper: (output) => output,
    })
    .build();
}
