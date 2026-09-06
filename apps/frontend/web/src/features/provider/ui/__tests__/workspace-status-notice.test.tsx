import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProviderSummary } from "../../domain/types";

/**
 * The viewmodel is the seam, the same one `user-menu.test.tsx` uses. The
 * notice's whole job is to read one field off the active workspace, so the
 * test's job is to vary that field.
 */
const state = { active: null as ProviderSummary | null };

vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({ activeProvider: state.active }),
}));

vi.mock("react-i18next", () => ({
  // The key back, so an assertion names the string that would render rather
  // than the English that happens to sit behind it today.
  useTranslation: () => ({ t: (k: string) => k }),
}));

const { WorkspaceStatusNotice } = await import("../workspace-status-notice");

function workspace(status: string): ProviderSummary {
  return {
    id: "p1",
    name: "Flávio Magalhães",
    slug: "flavio-magalhaes-9gcg0m",
    type: "individual",
    status,
    role: "owner",
  };
}

describe("WorkspaceStatusNotice", () => {
  it("says nothing when the workspace is live", () => {
    // Every approved provider sees this component on every page. It must be
    // invisible for them or it is noise on the overwhelming majority of loads.
    state.active = workspace("active");
    const { container } = render(<WorkspaceStatusNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells a workspace awaiting approval that nothing it publishes is visible", () => {
    // The gap this closes: the dashboard said "published" and the browse had
    // never heard of them, with nothing anywhere explaining the difference.
    state.active = workspace("pending");
    render(<WorkspaceStatusNotice />);
    expect(screen.getByText("workspaceStatus.pendingTitle")).toBeInTheDocument();
    expect(screen.getByText("workspaceStatus.pendingBody")).toBeInTheDocument();
  });

  it("distinguishes a suspended workspace from one still being reviewed", () => {
    // Both are invisible to customers and neither can publish, but they are
    // not the same news: one is waiting, the other has been stopped. Three
    // published services sit behind suspended workspaces today.
    state.active = workspace("suspended");
    render(<WorkspaceStatusNotice />);
    expect(screen.getByText("workspaceStatus.suspendedTitle")).toBeInTheDocument();
    expect(screen.queryByText("workspaceStatus.pendingTitle")).not.toBeInTheDocument();
  });

  it("treats a status it has never seen as not live", () => {
    // The column is plain text on the server. An unrecognised value must not
    // read as "fine" — silent optimism is the bug being fixed.
    state.active = workspace("something-new");
    render(<WorkspaceStatusNotice />);
    expect(screen.getByText("workspaceStatus.pendingTitle")).toBeInTheDocument();
  });

  it("says nothing when there is no workspace at all", () => {
    state.active = null;
    const { container } = render(<WorkspaceStatusNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
