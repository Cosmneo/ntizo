import { DrizzleActivityRepository } from "../../../bounded-contexts/activity/infrastructure/repositories/drizzle/activity.repository";
import { ListActivityProjection } from "../app/use-cases/list-activity.projection";

/**
 * The read tier imports the write tier's repository rather than owning a
 * duplicate — the same ruling `read/notification`'s bootstrap documents and
 * for the same reason: this read model is the same rows in the same shape as
 * the write side's, and a second class running identical SQL is two places
 * to fix one bug.
 */
export function bootstrapActivityRead() {
  const repo = new DrizzleActivityRepository();

  return {
    adapters: { repo },
    useCases: {
      listMine: new ListActivityProjection(repo),
    },
  };
}

export type ActivityReadBootstrap = ReturnType<typeof bootstrapActivityRead>;
