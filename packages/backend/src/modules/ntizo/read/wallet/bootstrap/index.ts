import { DrizzleWalletReadRepository } from "../infra/repositories/drizzle/wallet-read.repository";
import { GetProviderWalletProjection } from "../app/use-cases/get-provider-wallet.projection";
import { DrizzleProviderReadRepository } from "../../provider/infra/repositories/drizzle/provider-read.repository";
import type { WalletReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapWalletRead(): {
  adapters: { walletReadRepository: DrizzleWalletReadRepository };
  useCases: WalletReadModule;
} {
  const walletReadRepository = new DrizzleWalletReadRepository();
  return {
    adapters: { walletReadRepository },
    useCases: {
      getProviderWallet: new GetProviderWalletProjection(walletReadRepository),
      providerRead: new DrizzleProviderReadRepository(),
    },
  };
}

export type WalletReadBootstrap = ReturnType<typeof bootstrapWalletRead>;
