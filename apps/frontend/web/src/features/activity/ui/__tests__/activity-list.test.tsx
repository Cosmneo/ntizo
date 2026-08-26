import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import i18n from "@/shared/lib/i18n";
import { activityTypeKey } from "../../domain/types";
import { ActivityList } from "../activity-list";

/**
 * `serviceName`/`providerName` in an activity entry's `payload` are typed by
 * whoever created the service or provider — a customer never controls that
 * string, but a provider does, and it ends up on a page a *different*
 * person (the customer) reads. `i18n.ts` sets `interpolation: { escapeValue:
 * false }` because React already escapes at render time and double-escaping
 * would be wrong — but that correctness depends entirely on the interpolated
 * value reaching the DOM through an ordinary JSX text child, never through
 * `dangerouslySetInnerHTML` or a markup-parsing `<Trans>`. This file is
 * where that dependency gets checked rather than assumed.
 *
 * Placed under `features/activity/ui/__tests__`, not `shared/lib/__tests__`
 * alongside the copy test: this file renders `ActivityList`, a `ui`-layer
 * component, and `eslint-plugin-boundaries` (`apps/frontend/web/eslint.config.js`)
 * only lets `shared` import `domain` and `shared` — a `shared` test file
 * importing `ui` would fail `boundaries/dependencies` lint, not just look
 * unconventional.
 */
const HOSTILE = "<img src=x onerror=alert(1)>";

const entry = {
  id: "a1",
  type: "service.published",
  payload: { serviceName: HOSTILE },
  occurredAt: "2026-08-26T10:00:00Z",
};

describe("ActivityList renders a hostile payload value safely", () => {
  it("never turns markup text into a real DOM element", () => {
    // Mirrors the task brief's own fixture: a `renderDescription` that
    // builds the sentence directly, the way any caller of `ActivityList`
    // does, without going through the real translation call. This isolates
    // exactly one question — does `ActivityList` itself render `description`
    // as text — independent of whatever the caller computed it from.
    render(
      <ActivityList
        entries={[entry]}
        loading={false}
        locale="en-US"
        title="t"
        emptyTitle="e"
        emptyBody="b"
        renderDescription={(e) => `Published ${String(e.payload.serviceName)}`}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
  });

  it("stays safe through the real translation call the page actually makes", () => {
    // The production path, not a stand-in for it: `customer-activity-page.tsx`
    // computes `description` as `t(activityType.<key>, { replace: payload })`.
    // `i18n.ts` sets `escapeValue: false`, so this call hands the hostile
    // string straight through into the sentence — verifying it still lands
    // on the page as inert text is what closes the loop the isolated test
    // above leaves open.
    const description = i18n.t(`account:activityType.${activityTypeKey(entry.type)}`, {
      replace: entry.payload,
    });
    expect(description).toContain(HOSTILE);

    render(
      <ActivityList
        entries={[entry]}
        loading={false}
        locale="en-US"
        title="t"
        emptyTitle="e"
        emptyBody="b"
        renderDescription={() => description}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    // The literal markup text is on the page — as text, not as an element.
    expect(document.body.textContent).toContain(HOSTILE);
  });
});
