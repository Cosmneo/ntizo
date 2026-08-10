import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import type { SearchCitiesPort } from "../../app/ports/inbound";
import { cityPublicSchema } from "../schema/queries";

/**
 * The public city surface. Members are inbound PORTS, injected by the
 * composition root — a public slice must never import a projection from
 * `read/`, and the import guard beside this tier forbids it.
 */
export interface CityPublicModule {
  readonly searchCities: SearchCitiesPort;
}

export function createCityPublicHandlers(publicModule: CityPublicModule) {
  return graphqlRoutes(cityPublicSchema)
    .handleWithUseCase("city.search", {
      // No context is read. There is no requester, and a gazetteer does not
      // vary by who asks for it.
      argsMapper: (args) => args.input,
      useCase: publicModule.searchCities,
      responseMapper: (output) => output,
    })
    .build();
}
