import { DrizzleActivityRepository } from "../infrastructure/repositories/drizzle/activity.repository";
import { DrizzleProviderNameReader } from "../infrastructure/outbound-adapters/cross-bc/provider-name-reader.adapter";
import { DrizzleServiceNameReader } from "../infrastructure/outbound-adapters/cross-bc/service-name-reader.adapter";
import { RecordActivityInternalCommand } from "../app/use-cases/record-activity.internal.command";

export function bootstrapActivity() {
  const repository = new DrizzleActivityRepository();
  const providerNameReader = new DrizzleProviderNameReader();
  const serviceNameReader = new DrizzleServiceNameReader();
  return {
    repositories: { activity: repository },
    // The two cross-BC reads the write-side event handlers need to snapshot
    // a name into a history row (F5): each is this context's own port,
    // implemented by its own adapter, not borrowed from another context.
    adapters: { providerNameReader, serviceNameReader },
    useCases: { internal: { recordActivity: new RecordActivityInternalCommand(repository) } },
  };
}

export type ActivityBootstrap = ReturnType<typeof bootstrapActivity>;
