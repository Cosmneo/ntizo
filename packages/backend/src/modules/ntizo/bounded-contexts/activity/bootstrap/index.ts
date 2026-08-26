import { DrizzleActivityRepository } from "../infrastructure/repositories/drizzle/activity.repository";
import { RecordActivityInternalCommand } from "../app/use-cases/record-activity.internal.command";

export function bootstrapActivity() {
  const repository = new DrizzleActivityRepository();
  return {
    repositories: { activity: repository },
    useCases: { internal: { recordActivity: new RecordActivityInternalCommand(repository) } },
  };
}

export type ActivityBootstrap = ReturnType<typeof bootstrapActivity>;
