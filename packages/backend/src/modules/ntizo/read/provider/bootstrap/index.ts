import { DrizzleProviderReadRepository } from "../infra/repositories/drizzle/provider-read.repository";
import { ListMyProvidersProjection } from "../app/use-cases/list-my-providers.projection";
import { GetProviderDetailProjection } from "../app/use-cases/get-provider-detail.projection";
import type { ProviderReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapProviderRead(): {
  adapters: { providerReadRepository: DrizzleProviderReadRepository };
  useCases: ProviderReadModule;
} {
  const providerReadRepository = new DrizzleProviderReadRepository();
  return {
    adapters: { providerReadRepository },
    useCases: {
      listMyProviders: new ListMyProvidersProjection(providerReadRepository),
      getProviderDetail: new GetProviderDetailProjection(providerReadRepository),
    },
  };
}

export type ProviderReadBootstrap = ReturnType<typeof bootstrapProviderRead>;
