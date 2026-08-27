import { describe, expect, it } from "vitest";
import { providerNavGroups } from "../navigation";

/**
 * A page nobody can navigate to is the same failure as a handler nobody
 * mounted. `provider-messages-page.tsx` and its route
 * (`routes/provider/$slug/messages.tsx`) exist, but neither is reachable
 * from the provider zone's own sidebar unless an entry here points at it —
 * this test is what fails the moment that entry is missing or its `url`
 * drifts from the route that actually exists, the same way this project has
 * already shipped an unreachable page once before.
 */
describe("providerNavGroups: the messages entry", () => {
  it("links to the provider messages route", () => {
    const allItems = providerNavGroups.flatMap((group) => group.items);
    const messagesItem = allItems.find((item) => item.url === "/provider/$slug/messages");

    expect(messagesItem).toBeDefined();
    expect(messagesItem?.titleKey).toBe("nav.messages");
  });

  it("appears exactly once across every group", () => {
    const allItems = providerNavGroups.flatMap((group) => group.items);
    const matches = allItems.filter((item) => item.url === "/provider/$slug/messages");
    expect(matches).toHaveLength(1);
  });
});
