import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import type {
  GetPublicProviderPort,
  ListProviderCityFacetsPort,
  ListPublicProvidersPort,
} from "../../app/ports/inbound";
import { providerPublicSchema } from "../schema/queries";

/**
 * The public provider surface.
 *
 * Members are inbound PORTS, injected by the composition root. A public slice
 * must never import a projection from `read/` — those are authorization-scoped
 * and the import guard forbids it. Injection keeps the wiring a runtime edge
 * the bootstrap owns.
 */
export interface ProviderPublicModule {
  readonly listProviders: ListPublicProvidersPort;
  readonly getProvider: GetPublicProviderPort;
  readonly listCityFacets: ListProviderCityFacetsPort;
}

/** The page size the directory gets when a caller names none — see the schema's own note on zod defaults. */
const DEFAULT_PAGE_SIZE = 24;

export function createProviderPublicHandlers(publicModule: ProviderPublicModule) {
  return graphqlRoutes(providerPublicSchema)
    .handleWithUseCase("provider.list", {
      // No context is read at all. There is no requester to take one from, and
      // nothing here varies by who is asking.
      argsMapper: (args) => ({
        ...args.input,
        limit: args.input.limit ?? DEFAULT_PAGE_SIZE,
        offset: args.input.offset ?? 0,
      }),
      useCase: publicModule.listProviders,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.bySlug", {
      argsMapper: (args) => args.input,
      useCase: publicModule.getProvider,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.cities", {
      argsMapper: () => undefined as never,
      useCase: publicModule.listCityFacets,
      responseMapper: (output) => output,
    })
    .build();
}
