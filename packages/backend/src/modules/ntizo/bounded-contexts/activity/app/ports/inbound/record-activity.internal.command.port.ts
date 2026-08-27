import type { ActivityType } from "../../../domain/activity-type";

export interface RecordActivityInternalInput {
  actorUserId: string;
  type: ActivityType;
  /** Already snapshotted by the caller. See the table's column comment. */
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface RecordActivityInternalPort {
  execute(input: RecordActivityInternalInput): Promise<void>;
}
