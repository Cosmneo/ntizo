import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInput } from "../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";
import { UserRegistered } from "../../../bounded-contexts/user/domain/events";
import { ProviderCreated } from "../../../bounded-contexts/provider/domain/events";
import { registerUserNotificationHandlers } from "../events/handlers/user.event-handlers";

class SpyRaise {
  calls: RaiseNotificationInput[] = [];
  async execute(input: RaiseNotificationInput) {
    this.calls.push(input);
    return { notificationId: `n${this.calls.length}` };
  }
}

let router: EventRouter;
let raise: SpyRaise;

beforeEach(() => {
  router = new EventRouter();
  raise = new SpyRaise();
  registerUserNotificationHandlers(router, { raiseNotification: raise as never });
});

describe("user.registered", () => {
  it("welcomes the person, in their own inbox", async () => {
    await router.dispatch([
      new UserRegistered({ userId: "u1", email: "ana@ntizo.test", firstName: "Ana" }),
    ]);

    expect(raise.calls).toHaveLength(1);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.Welcome,
      audience: "user",
      userId: "u1",
    });
  });

  it("snapshots the first name the greeting uses", async () => {
    await router.dispatch([
      new UserRegistered({ userId: "u1", email: "ana@ntizo.test", firstName: "Ana" }),
    ]);
    expect(raise.calls[0]!.payload).toEqual({ firstName: "Ana" });
  });

  it("still raises the row when no name is known", async () => {
    // A nameless welcome is a template problem, not a reason to leave a new
    // account with an empty inbox and a bell that has never lit up.
    await router.dispatch([
      new UserRegistered({ userId: "u1", email: "ana@ntizo.test", firstName: null }),
    ]);
    expect(raise.calls[0]!.payload).toEqual({ firstName: null });
  });

  it("registers only for user.registered", async () => {
    await router.dispatch([
      new ProviderCreated({ providerId: "p1", ownerUserId: "u1", type: "individual" }),
    ]);
    expect(raise.calls).toEqual([]);
  });
});
