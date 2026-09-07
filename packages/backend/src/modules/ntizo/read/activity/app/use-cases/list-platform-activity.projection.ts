import type { ActivityType } from "@ntizo/shared";
import type { PlatformActivityPageDTO } from "@ntizo/shared/read-models";
import type { ActivityRepositoryPort } from "../../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";
import type { ActorReaderPort } from "../ports/outbound/actor-reader.port";
import { clampLimit } from "./list-activity.projection";

/**
 * A page of everybody's history, with who did each thing.
 *
 * Takes no reader at all: the handler proves the caller is an administrator
 * before this runs, and there is no second check further in — the same
 * arrangement as the booking queue's `ListAdminBookingsProjection`. The
 * actors are resolved in one batched read for the page, never one per row.
 */
export class ListPlatformActivityProjection {
  constructor(
    private readonly repo: ActivityRepositoryPort,
    private readonly actors: ActorReaderPort,
  ) {}

  async execute(input: {
    limit?: number | undefined;
    cursor?: string | null | undefined;
    type?: ActivityType | undefined;
    search?: string | undefined;
  }): Promise<PlatformActivityPageDTO> {
    const page = await this.repo.listAll({
      limit: clampLimit(input.limit),
      cursor: input.cursor ?? null,
      type: input.type,
      search: input.search,
    });
    const ids = [...new Set(page.items.map((a) => a.actorUserId))];
    const actors = ids.length > 0 ? await this.actors.findActorsByIds(ids) : new Map();
    return {
      items: page.items.map((a) => {
        const actor = actors.get(a.actorUserId);
        return {
          id: a.id!,
          type: a.type,
          payload: a.payload,
          occurredAt: a.occurredAt.toISOString(),
          actorUserId: a.actorUserId,
          // An actor the user table no longer has: the row outlives the
          // account, as its payload's names outlive what they named.
          actorName: actor?.name ?? "",
          actorEmail: actor?.email ?? null,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
}
