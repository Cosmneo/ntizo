import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type {
  GetProviderDetailProjectionPort,
  ListMyProvidersProjectionPort,
} from "../../app/ports/inbound";
import { providerReadSchema } from "../schema/queries";
import { mapGetProviderDetailInput, mapListMyProvidersInput } from "./arg-mappers";

/**
 * The provider READ surface. Members are typed as inbound PORTS, not concrete
 * classes, so the handler stays decoupled from the projection implementations.
 */
export interface ProviderReadModule {
  readonly listMyProviders: ListMyProvidersProjectionPort;
  readonly getProviderDetail: GetProviderDetailProjectionPort;
}

export function createProviderReadHandlers(readModule: ProviderReadModule) {
  return graphqlRoutes(providerReadSchema)
    .handleWithUseCase("provider.mine", {
      argsMapper: (_args, ctx) => mapListMyProvidersInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.listMyProviders,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.byId", {
      argsMapper: (args, ctx) =>
        mapGetProviderDetailInput(args.input, asNtizoGraphqlContext(ctx)),
      useCase: readModule.getProviderDetail,
      responseMapper: (output) => output,
    })
    .build();
}
