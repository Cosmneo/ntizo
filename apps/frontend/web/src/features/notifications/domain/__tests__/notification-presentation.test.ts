import { describe, expect, it } from "vitest";
import { Mail, Store } from "lucide-react";
import { presentationFor } from "@/features/notifications/domain/notification-presentation";

describe("presentationFor", () => {
  it("knows the four support types and the message one", () => {
    expect(presentationFor("SUPPORT_REQUEST_OPENED").key).toBe("supportRequestOpened");
    expect(presentationFor("SUPPORT_REQUEST_MESSAGE").key).toBe("supportRequestMessage");
    expect(presentationFor("SUPPORT_REPLY").key).toBe("supportReply");
    expect(presentationFor("SUPPORT_REQUEST_RESOLVED").key).toBe("supportRequestResolved");
    expect(presentationFor("NEW_MESSAGE").key).toBe("newMessage");
  });

  it("falls back to a generic envelope for a type this bundle has never heard of", () => {
    // The whole point of this function: a deploy skew can raise a type added
    // after this bundle shipped, and it must render as something rather than
    // throw. "INVENTED_TYPE_NOBODY_SHIPPED" stands in for that.
    expect(presentationFor("INVENTED_TYPE_NOBODY_SHIPPED")).toEqual({
      icon: Mail,
      key: "unknown",
    });
  });

  it("resolves a known type to its own entry, not the fallback", () => {
    // PROVIDER_WORKSPACE_WELCOME's icon (Store) and key differ from the
    // fallback's (Mail / "unknown") on purpose: if the lookup itself were
    // broken and always fell through, this assertion — not just the one
    // above — would catch it.
    expect(presentationFor("PROVIDER_WORKSPACE_WELCOME")).toEqual({
      icon: Store,
      key: "providerWorkspaceWelcome",
    });
  });
});
