import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@ntizo/frontend-ui";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { name: "Ana M", email: "ana@example.com", avatarUrl: null } }),
}));
vi.mock("@/features/user/viewmodel/use-sign-out", () => ({
  useSignOut: () => async () => ({ serverRevokeFailed: false }),
}));

const { ConsoleUserMenu } = await import("./console-user-menu");

function renderMenu(children?: React.ReactNode) {
  return render(
    <SidebarProvider>
      <ConsoleUserMenu ns="provider">{children}</ConsoleUserMenu>
    </SidebarProvider>,
  );
}

describe("ConsoleUserMenu", () => {
  it("renders the signed-in name inside the sidebar trigger — the e2e sign-out helper matches on it", () => {
    renderMenu();
    const trigger = document.querySelector('[data-sidebar="menu-button"]');
    expect(trigger).toHaveTextContent("Ana M");
  });

  it("offers Sign out as a menu item", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("Ana M"));
    expect(await screen.findByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("renders whatever the zone hands it as the workspace section, and nothing when it hands nothing", async () => {
    const { unmount } = renderMenu(<div data-testid="switcher">switcher</div>);
    await userEvent.click(screen.getByText("Ana M"));
    expect(await screen.findByTestId("switcher")).toBeInTheDocument();
    unmount();

    renderMenu();
    await userEvent.click(screen.getByText("Ana M"));
    await screen.findByRole("menuitem", { name: /sign out/i });
    expect(screen.queryByTestId("switcher")).not.toBeInTheDocument();
  });
});
