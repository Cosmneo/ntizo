import { Activity } from "../../domain/aggregates/activity.aggregate";
import type { ActivityRepositoryPort } from "../ports/outbound/activity.repository.port";
import type {
  RecordActivityInternalInput,
  RecordActivityInternalPort,
} from "../ports/inbound/record-activity.internal.command.port";

/**
 * The one way an activity row comes into existence.
 *
 * Internal: there is no mutation behind it and there must not be. Activity is
 * a consequence of something the platform observed, never something a client
 * asks for — an endpoint that recorded activity would let anybody write into
 * anybody's history.
 *
 * **Never throws at its caller.** Every caller is a domain-event handler
 * running after the producing transaction committed. A history entry is worth
 * less than the write it describes, and losing the write to save the entry is
 * the wrong way round.
 */
export class RecordActivityInternalCommand implements RecordActivityInternalPort {
  constructor(private readonly repo: ActivityRepositoryPort) {}

  async execute(input: RecordActivityInternalInput): Promise<void> {
    try {
      await this.repo.save(
        Activity.record({
          actorUserId: input.actorUserId,
          type: input.type,
          payload: input.payload,
          occurredAt: input.occurredAt,
        }),
      );
    } catch (error) {
      // console.error, not the logger: getRequestScopedLogger() throws when no
      // scope is set and nothing in this repo sets one. The error is a
      // SEPARATE argument — interpolating it invokes getters that can throw.
      // tx-context.ts:21 does the same for the same reason.
      console.error("[activity] could not record an action", error);
    }
  }
}
