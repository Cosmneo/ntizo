import { describe, expect, it } from "bun:test";
import { notificationReadSchema } from "../graphql/schema/queries";

describe("the notification read schema", () => {
  it("exposes exactly the four fields the frontend needs, and no more", () => {
    const fields = Object.keys(
      (notificationReadSchema as unknown as { fields: { notification: object } }).fields
        .notification,
    ).sort();
    expect(fields).toEqual([
      "forProvider",
      "mine",
      "mineUnreadCount",
      "providerUnreadCount",
    ]);
  });

  it("takes no user id on the personal fields — the session is the answer", () => {
    // A `userId` argument here would be the whole authorization model, undone.
    const src = Bun.file(
      new URL("../graphql/schema/queries.ts", import.meta.url).pathname,
    );
    return src.text().then((text) => {
      const mineBlock = text.slice(
        text.indexOf("export const listMyNotifications"),
        text.indexOf("export const countMyUnreadNotifications"),
      );
      expect(mineBlock).not.toContain("userId");
    });
  });
});
