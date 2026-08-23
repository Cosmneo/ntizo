import { beforeEach, describe, expect, it } from "bun:test";
import { EventRouter } from "../event-router";

function evt(name: string): { eventName: string; occurredOn: Date } {
  return { eventName: name, occurredOn: new Date() };
}

let router: EventRouter;
beforeEach(() => {
  router = new EventRouter();
});

describe("EventRouter", () => {
  it("calls the handler registered for an event", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => void seen.push("hit"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen).toEqual(["hit"]);
  });

  it("ignores an event nobody listens for", async () => {
    await router.dispatch([evt("provider.updated") as never]);
    // No throw is the assertion: most events have no notification, and an
    // unhandled one must not be an error.
    expect(true).toBe(true);
  });

  it("runs every handler registered for the same event", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => void seen.push("a"));
    router.on("provider.created", async () => void seen.push("b"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("a handler that throws does not stop its siblings", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => {
      throw new Error("boom");
    });
    router.on("provider.created", async () => void seen.push("survived"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen).toEqual(["survived"]);
  });

  it("a handler that throws does not reject the dispatch", async () => {
    router.on("provider.created", async () => {
      throw new Error("boom");
    });
    // The write has already committed. Turning a successful approval into a
    // failure because a notification could not be written is the worse outcome.
    await expect(router.dispatch([evt("provider.created") as never])).resolves.toBeUndefined();
  });
});
