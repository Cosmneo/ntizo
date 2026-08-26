import { describe, expect, it } from "vitest";
import { activityTypeKey } from "../types";

describe("activityTypeKey", () => {
  it("flattens the dot, because i18next reads it as nesting", () => {
    // t("activityType.service.published") looks for {service:{published}}.
    // The translation file is flat, so the dot has to go.
    expect(activityTypeKey("service.published")).toBe("servicePublished");
    expect(activityTypeKey("provider.inviteSent")).toBe("providerInviteSent");
  });

  it("leaves a key with no dot alone", () => {
    expect(activityTypeKey("welcome")).toBe("welcome");
  });

  it("flattens all nine real wire types, including the two with a second dot", () => {
    // provider.invite.sent and provider.invite.accepted are the only two of
    // the nine with more than one dot. An implementation that only handles a
    // single split (e.g. replacing just the first ".") would still pass the
    // two-segment cases above and only fail here — this is the case that
    // catches that mutation.
    expect(activityTypeKey("user.registered")).toBe("userRegistered");
    expect(activityTypeKey("provider.created")).toBe("providerCreated");
    expect(activityTypeKey("provider.status.decided")).toBe(
      "providerStatusDecided",
    );
    expect(activityTypeKey("provider.invite.sent")).toBe(
      "providerInviteSent",
    );
    expect(activityTypeKey("provider.invite.accepted")).toBe(
      "providerInviteAccepted",
    );
    expect(activityTypeKey("service.created")).toBe("serviceCreated");
    expect(activityTypeKey("service.published")).toBe("servicePublished");
    expect(activityTypeKey("service.unpublished")).toBe("serviceUnpublished");
    expect(activityTypeKey("review.created")).toBe("reviewCreated");
  });

  it("degrades a type this bundle has never heard of to a key rather than throwing", () => {
    // ACTIVITY_TYPES is a closed nine on the server, but this function is a
    // pure string transform, not a lookup against that list — a deploy skew
    // reaching a tenth type must still produce a (missing) i18next key for
    // the list to render as a raw key, not a component that throws and
    // takes the whole feed down over one unrecognised row. Mirrors
    // `notifications`' `presentationFor` fallback test, adapted to a
    // transform that has no lookup table to miss.
    expect(activityTypeKey("booking.confirmed.by.provider")).toBe(
      "bookingConfirmedByProvider",
    );
  });
});
