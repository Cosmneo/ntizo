import { describe, expect, it } from "bun:test";
import { activity } from "../activity/schemas/activity.schema";

describe("the activity table", () => {
  it("keys rows by the actor, not by what was acted on", () => {
    // The whole distinction from the inbox. A row keyed by the thing would
    // make "what did I do" unanswerable without a join that does not exist.
    expect(activity.actorUserId.notNull).toBe(true);
    expect(activity.actorUserId.name).toBe("actor_user_id");
  });

  it("has no read state, because activity is not read", () => {
    // If this ever gains a `read_at`, the table has drifted into being a
    // second inbox and the two will disagree about what a notification is.
    const columns = Object.keys(activity);
    expect(columns).not.toContain("readAt");
    expect(columns).not.toContain("isRead");
  });

  it("records when the event happened, separately from when it was written", () => {
    expect(activity.occurredAt.notNull).toBe(true);
    expect(activity.createdAt.notNull).toBe(true);
  });
});
