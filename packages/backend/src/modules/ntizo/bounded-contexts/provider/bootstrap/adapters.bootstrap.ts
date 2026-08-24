import { DrizzleProviderRepository } from "../infrastructure/repositories/drizzle/provider";
import { DrizzleProviderMemberRepository } from "../infrastructure/repositories/drizzle/provider-member";
import { DrizzleProviderInviteRepository } from "../infrastructure/repositories/drizzle/provider-invite";
import { DrizzlePlatformSettingsAdapter } from "../infrastructure/outbound-adapters/drizzle-platform-settings.adapter";
import { DrizzleWalletRepository } from "../infrastructure/repositories/drizzle/wallet/drizzle-wallet.repository";
import { DrizzleInviterLocaleAdapter } from "../infrastructure/outbound-adapters/drizzle-inviter-locale.adapter";
import { ProviderEmailServiceAdapter } from "../infrastructure/outbound-adapters";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";
// The provider bounded context's one door onto the catalog — see
// `CatalogRepositoryPort`. `DrizzleServiceRepository` already implements
// `unpublishServicesWithoutMembers`, so it satisfies that port structurally;
// reusing it here rather than adding a wrapper mirrors how the scheduling
// bounded context's Drizzle repository already reads the catalog's own
// tables directly.
import { DrizzleServiceRepository } from "../../catalog/infrastructure/repositories/drizzle/service.repository";

export function bootstrapAdapters() {
  const providerRepository = new DrizzleProviderRepository();
  const providerMemberRepository = new DrizzleProviderMemberRepository();
  const providerInviteRepository = new DrizzleProviderInviteRepository();
  const emailService = new ProviderEmailServiceAdapter();
  const inviterLocale = new DrizzleInviterLocaleAdapter();
  const walletRepository = new DrizzleWalletRepository();
  const platformSettings = new DrizzlePlatformSettingsAdapter();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  const catalogRepository = new DrizzleServiceRepository();

  return {
    providerRepository,
    providerMemberRepository,
    providerInviteRepository,
    emailService,
    inviterLocale,
    walletRepository,
    platformSettings,
    unitOfWork,
    outboxPort,
    catalogRepository,
  };
}

export type ProviderAdapters = ReturnType<typeof bootstrapAdapters>;
