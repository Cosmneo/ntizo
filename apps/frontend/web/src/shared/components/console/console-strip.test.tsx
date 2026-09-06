import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  // The key back, so an assertion names the string that would render rather
  // than the English that happens to sit behind it today.
  useTranslation: () => ({ t: (k: string) => k }),
}));

const { ConsoleStrip } = await import("./console-strip");

describe("ConsoleStrip", () => {
  it("shows the commission for a live workspace, and no status sentence", () => {
    render(<ConsoleStrip status="active" commission="12%" />);
    expect(screen.getByText("commissionRateLabel")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an em dash when the rate is not known yet", () => {
    render(<ConsoleStrip status="active" commission={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("tells a workspace awaiting approval that nothing it publishes is visible", () => {
    // The gap this closes: the dashboard said "published" and the browse had
    // never heard of them, with nothing anywhere explaining the difference.
    render(<ConsoleStrip status="pending" commission="12%" />);
    expect(screen.getByRole("status")).toHaveTextContent("workspaceStatus.pendingTitle");
    expect(screen.getByText("workspaceStatus.pendingBody")).toBeInTheDocument();
    expect(screen.queryByText("commissionRateLabel")).not.toBeInTheDocument();
  });

  it("distinguishes a suspended workspace from one still being reviewed", () => {
    render(<ConsoleStrip status="suspended" commission="12%" />);
    expect(screen.getByText("workspaceStatus.suspendedTitle")).toBeInTheDocument();
    expect(screen.queryByText("workspaceStatus.pendingTitle")).not.toBeInTheDocument();
  });

  it("treats a status it has never seen as not live", () => {
    // The column is plain text on the server. An unrecognised value must not
    // read as "fine" — silent optimism is the bug being fixed.
    render(<ConsoleStrip status="something-new" commission="12%" />);
    expect(screen.getByText("workspaceStatus.pendingTitle")).toBeInTheDocument();
  });
});
