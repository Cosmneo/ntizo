import { DrizzleProviderRepository } from "../infrastructure/repositories/drizzle/provider";
import { DrizzleProviderMemberRepository } from "../infrastructure/repositories/drizzle/provider-member";
import { DrizzleProviderInviteRepository } from "../infrastructure/repositories/drizzle/provider-invite";
import { DrizzleInviterLocaleAdapter } from "../infrastructure/outbound-adapters/drizzle-inviter-locale.adapter";
import { ProviderEmailServiceAdapter } from "../infrastructure/outbound-adapters";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export function bootstrapAdapters() {
  const providerRepository = new DrizzleProviderRepository();
  const providerMemberRepository = new DrizzleProviderMemberRepository();
  const providerInviteRepository = new DrizzleProviderInviteRepository();
  const emailService = new ProviderEmailServiceAdapter();
  const inviterLocale = new DrizzleInviterLocaleAdapter();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  return {
    providerRepository,
    providerMemberRepository,
    providerInviteRepository,
    emailService,
    inviterLocale,
    unitOfWork,
    outboxPort,
  };
}

export type ProviderAdapters = ReturnType<typeof bootstrapAdapters>;
