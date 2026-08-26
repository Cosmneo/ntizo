import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface ReviewActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
}

/**
 * What the Review context's one event means to somebody's history.
 *
 * No lookup here, unlike the Provider and Catalog handlers: `ReviewCreated`
 * already snapshots the provider's name (Task 5), because the review itself
 * is the place that name was written down — there is nothing left for this
 * handler to resolve.
 */
export function registerReviewActivityHandlers(
  router: EventRouter,
  deps: ReviewActivityDeps,
): void {
  router.on("review.created", async (event) => {
    const payload = event.payload as {
      providerName: string;
      rating: number;
      actorUserId: string;
    };
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "review.created",
      payload: { providerName: payload.providerName, rating: payload.rating },
      occurredAt: event.occurredOn,
    });
  });
}
