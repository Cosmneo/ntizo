import { DrizzleProviderReadRepository } from "../infra/repositories/drizzle/provider-read.repository";
import { ListMyProvidersProjection } from "../app/use-cases/list-my-providers.projection";
import { GetProviderDetailProjection } from "../app/use-cases/get-provider-detail.projection";
import { GetProviderDetailForAdminProjection } from "../app/use-cases/get-provider-detail-for-admin.projection";
import { ListProvidersForAdminProjection } from "../app/use-cases/list-providers-for-admin.projection";
import { DrizzleProviderAdminRepository } from "../infra/repositories/drizzle/provider-admin.repository";
import type { ProviderReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapProviderRead(): {
  adapters: { providerReadRepository: DrizzleProviderReadRepository };
  useCases: ProviderReadModule;
} {
  const providerReadRepository = new DrizzleProviderReadRepository();
  const providerAdminRepository = new DrizzleProviderAdminRepository();
  return {
    adapters: { providerReadRepository },
    useCases: {
      listMyProviders: new ListMyProvidersProjection(providerReadRepository),
      getProviderDetail: new GetProviderDetailProjection(providerReadRepository),
      listProvidersForAdmin: new ListProvidersForAdminProjection(providerAdminRepository),
      getProviderDetailForAdmin: new GetProviderDetailForAdminProjection(
        providerAdminRepository,
      ),
    },
  };
}

export type ProviderReadBootstrap = ReturnType<typeof bootstrapProviderRead>;
