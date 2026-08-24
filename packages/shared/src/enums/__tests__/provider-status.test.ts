import { describe, expect, it } from "vitest";
import {
  PROVIDER_STATUSES,
  PROVIDER_STATUS_TRANSITIONS,
  ProviderStatus,
  canTransition,
  isPubliclyVisible,
} from "../provider-enums/provider-status.enum";

describe("ProviderStatus", () => {
  it("shows only an active provider publicly", () => {
    // The directory is crawlable. A pending application appearing there is a
    // business listed before anyone checked it exists.
    for (const status of PROVIDER_STATUSES) {
      expect(isPubliclyVisible(status)).toBe(status === ProviderStatus.Active);
    }
  });

  it("covers every status in the transition map", () => {
    // A status missing from the map would throw on read, and the throw would
    // land in an admin screen rather than here.
    expect(Object.keys(PROVIDER_STATUS_TRANSITIONS).sort()).toEqual(
      [...PROVIDER_STATUSES].sort(),
    );
  });

  it("refuses to suspend something that never traded", () => {
    // Suspending a pending application is not a decision anyone means to make;
    // rejecting it is. The two read the same to a user and mean different
    // things to the business.
    expect(canTransition(ProviderStatus.Pending, ProviderStatus.Suspended)).toBe(false);
    expect(canTransition(ProviderStatus.Pending, ProviderStatus.Rejected)).toBe(true);
  });

  it("refuses to re-decide a provider that is already where it is", () => {
    for (const status of PROVIDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("lets a rejected application and a suspended business both come back", () => {
    expect(canTransition(ProviderStatus.Rejected, ProviderStatus.Active)).toBe(true);
    expect(canTransition(ProviderStatus.Suspended, ProviderStatus.Active)).toBe(true);
  });

  it("does not let an active provider be rejected", () => {
    // Rejection is an answer to an application. A business that already traded
    // gets suspended — the distinction is what tells the two apart later.
    expect(canTransition(ProviderStatus.Active, ProviderStatus.Rejected)).toBe(false);
    expect(canTransition(ProviderStatus.Active, ProviderStatus.Suspended)).toBe(true);
  });
});
