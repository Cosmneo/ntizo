import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { Notification } from "../domain/aggregates/notification.aggregate";
import { UnknownNotificationTypeError } from "../domain/exceptions";

describe("Notification.forUser", () => {
  it("addresses a person and nobody else", () => {
    const n = Notification.forUser({
      type: NotificationType.Welcome,
      userId: "u1",
      payload: { firstName: "Ana" },
    });
    expect(n.audience).toBe("user");
    expect(n.userId).toBe("u1");
    expect(n.providerId).toBeNull();
  });

  it("has no id until something stores it", () => {
    const n = Notification.forUser({ type: NotificationType.Welcome, userId: "u1", payload: {} });
    expect(n.id).toBeNull();
  });
});

describe("Notification.forProvider", () => {
  it("addresses a business and nobody else", () => {
    const n = Notification.forProvider({
      type: NotificationType.ProviderVerified,
      providerId: "p1",
      payload: { providerName: "Salão X" },
    });
    expect(n.audience).toBe("provider");
    expect(n.providerId).toBe("p1");
    expect(n.userId).toBeNull();
  });
});

describe("the type must be one the platform knows", () => {
  it("refuses a string that is not a NotificationType", () => {
    expect(() =>
      Notification.forUser({
        type: "SOMETHING_INVENTED" as NotificationType,
        userId: "u1",
        payload: {},
      }),
    ).toThrow(UnknownNotificationTypeError);
  });
});

describe("the payload is a snapshot", () => {
  it("keeps what it was given, so a later rename cannot rewrite it", () => {
    const payload = { providerName: "Salão X" };
    const n = Notification.forProvider({
      type: NotificationType.ProviderVerified,
      providerId: "p1",
      payload,
    });
    payload.providerName = "Renamed";
    expect((n.payload as { providerName: string }).providerName).toBe("Salão X");
  });
});
