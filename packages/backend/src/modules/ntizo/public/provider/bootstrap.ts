import { DrizzleProviderPublicRepository } from "./infra/repositories/drizzle/provider-public.repository";
import { ListPublicProvidersProjection } from "./app/use-cases/list-public-providers.projection";
import { GetPublicProviderProjection } from "./app/use-cases/get-public-provider.projection";
import type { ProviderPublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapProviderPublic(): {
  adapters: { providerPublicRepository: DrizzleProviderPublicRepository };
  useCases: ProviderPublicModule;
} {
  const providerPublicRepository = new DrizzleProviderPublicRepository();
  return {
    adapters: { providerPublicRepository },
    useCases: {
      listProviders: new ListPublicProvidersProjection(providerPublicRepository),
      getProvider: new GetPublicProviderProjection(providerPublicRepository),
    },
  };
}
