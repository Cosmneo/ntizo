import type { ActivityPageDTO } from "@ntizo/shared/read-models";
import type { ActivityRepositoryPort } from "../../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";

/**
 * The default page, and the ceiling.
 *
 * Both live here rather than as zod `.default()` on the field: a zod default
 * does not survive into the GraphQL schema — the argument still emits as
 * `Int` and every caller would have to send one. `limit` is caller-controlled
 * and an unbounded one is a way to ask for the whole table — follow-up #20's
 * lesson, applied rather than rediscovered.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * A page of one person's own history.
 *
 * Takes no reader-supplied user id. `requesterUserId` is stamped by the
 * GraphQL handler from the session, never taken from `args` — this class has
 * no way to read anybody's history but its own caller's.
 */
export class ListActivityProjection {
  constructor(private readonly repo: ActivityRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<ActivityPageDTO> {
    // Clamped here, not in the schema: see DEFAULT_LIMIT's comment above.
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = await this.repo.listForActor({
      actorUserId: input.requesterUserId,
      limit,
      cursor: input.cursor ?? null,
    });
    return {
      items: page.items.map((a) => ({
        id: a.id!,
        type: a.type,
        payload: a.payload,
        occurredAt: a.occurredAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
