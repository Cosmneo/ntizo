import { DrizzleProviderRepository } from "../infrastructure/repositories/drizzle/provider";
import { DrizzleProviderMemberRepository } from "../infrastructure/repositories/drizzle/provider-member";
import { DrizzleProviderInviteRepository } from "../infrastructure/repositories/drizzle/provider-invite";
import { ProviderEmailServiceAdapter } from "../infrastructure/outbound-adapters";

export function bootstrapAdapters() {
  const providerRepository = new DrizzleProviderRepository();
  const providerMemberRepository = new DrizzleProviderMemberRepository();
  const providerInviteRepository = new DrizzleProviderInviteRepository();
  const emailService = new ProviderEmailServiceAdapter();

  return {
    providerRepository,
    providerMemberRepository,
    providerInviteRepository,
    emailService,
  };
}

export type ProviderAdapters = ReturnType<typeof bootstrapAdapters>;
