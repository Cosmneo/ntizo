import { describe, expect, test } from "vitest";
import { isWorkspaceLive, workspaceStatusBadgeKey } from "../workspace-status";

describe("isWorkspaceLive", () => {
  test("an approved workspace is live", () => {
    expect(isWorkspaceLive("active")).toBe(true);
  });

  test("a workspace still awaiting approval is not", () => {
    // The exact case that lost a provider their only listing: published
    // service, pending workspace, filtered out of the browse in silence.
    expect(isWorkspaceLive("pending")).toBe(false);
  });

  test("a suspended workspace is not", () => {
    // Three published services sit behind suspended workspaces today. The
    // storefront hides them for the same reason and by the same column.
    expect(isWorkspaceLive("suspended")).toBe(false);
  });

  test("an unknown status is not live", () => {
    // `ProviderStatus` is a widened string — the backend column is plain
    // text with no enum. A status this client has never heard of must read
    // as "not live" rather than default to visible: guessing optimistically
    // is how the silent failure happened in the first place.
    expect(isWorkspaceLive("something-new")).toBe(false);
  });

  test("no workspace at all is not live", () => {
    expect(isWorkspaceLive(undefined)).toBe(false);
  });
});

describe("workspaceStatusBadgeKey", () => {
  test("an approved workspace carries no badge", () => {
    // Most rows in the switcher. A badge on every one of them is a badge
    // that says nothing.
    expect(workspaceStatusBadgeKey("active")).toBeNull();
  });

  test("one awaiting approval is labelled as waiting", () => {
    expect(workspaceStatusBadgeKey("pending")).toBe("workspaceStatus.badgePending");
  });

  test("a suspended one is labelled as stopped, not as waiting", () => {
    expect(workspaceStatusBadgeKey("suspended")).toBe("workspaceStatus.badgeSuspended");
  });

  test("an unrecognised status is labelled rather than passed off as live", () => {
    // Same reason `isWorkspaceLive` refuses to guess: the switcher is where
    // somebody with a duplicate workspace picks between two rows that used
    // to look identical, and an unlabelled row reads as the working one.
    expect(workspaceStatusBadgeKey("something-new")).toBe("workspaceStatus.badgePending");
  });
});
