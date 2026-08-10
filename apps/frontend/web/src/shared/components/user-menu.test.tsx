import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";

/**
 * The viewmodel hooks are the seam, not the query cache.
 *
 * Seeding a real QueryClient would mean importing query keys from `data/`,
 * which `boundaries/dependencies` forbids from a `ui/` file — and rightly:
 * a ui component knows its hooks, not where they store things. Mocking here
 * keeps the test pointed at the same surface the component actually uses.
 */
const state = {
  user: null as Partial<CurrentUserDTO> | null,
  providers: [] as Array<{ id: string }>,
};

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: state.user }),
  useClearSessionQueryCache: () => () => {},
}));
vi.mock("@/features/provider/viewmodel/use-providers", () => ({
  useMyProviders: () => ({ data: state.providers }),
}));
vi.mock("@/features/user/viewmodel/use-sign-out", () => ({
  useSignOut: () => async () => ({ serverRevokeFailed: false }),
}));

const { UserMenu } = await import("./user-menu");

async function renderMenu(user: Partial<CurrentUserDTO> | null, providerCount = 0) {
  state.user = user;
  state.providers = Array.from({ length: providerCount }, (_, i) => ({ id: `p${i}` }));

  const root = createRootRoute({ component: () => <UserMenu /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

const ADMIN: Partial<CurrentUserDTO> = {
  id: "u-admin",
  email: "admin@ntizo.test",
  name: "Ada Admin",
  role: "admin",
};

const CUSTOMER: Partial<CurrentUserDTO> = {
  id: "u-cust",
  email: "cust@ntizo.test",
  name: "Carla Cliente",
  role: "customer",
};

async function openMenu() {
  await userEvent.setup().click(screen.getByLabelText("Account menu"));
}

describe("UserMenu", () => {
  it("shows the admin area to an admin", async () => {
    await renderMenu(ADMIN);
    await openMenu();
    expect(screen.getByText("Admin area")).toBeInTheDocument();
  });

  it("does not show the admin area to a plain customer", async () => {
    // The route guards itself too, but an entry that bounces you on click is
    // a worse experience than one that was never offered.
    await renderMenu(CUSTOMER);
    await openMenu();
    expect(screen.queryByText("Admin area")).toBeNull();
  });

  it("shows the provider dashboard to someone who owns a provider", async () => {
    // Ownership, not role: becoming a provider leaves `role` as "customer".
    await renderMenu(CUSTOMER, 1);
    await openMenu();
    expect(screen.getByText("Provider dashboard")).toBeInTheDocument();
  });

  it("invites a customer who owns none to become one instead", async () => {
    // The two are exclusive: whichever shows, /provider is the destination —
    // it redirects to the dashboard or to the create-one page by itself.
    await renderMenu(CUSTOMER, 0);
    await openMenu();
    expect(screen.queryByText("Provider dashboard")).toBeNull();
    expect(screen.getByText("Become a provider")).toBeInTheDocument();
  });

  it("does not invite an existing provider to become one", async () => {
    await renderMenu(CUSTOMER, 1);
    await openMenu();
    expect(screen.queryByText("Become a provider")).toBeNull();
  });

  it("offers the customer pages to everyone signed in", async () => {
    await renderMenu(CUSTOMER, 0);
    await openMenu();
    for (const label of ["My account", "My bookings", "Messages", "Favourites"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("identifies whose account it is", async () => {
    await renderMenu(ADMIN);
    await openMenu();
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
    expect(screen.getByText("admin@ntizo.test")).toBeInTheDocument();
  });

  it("renders no trigger at all when nobody is signed in", async () => {
    await renderMenu(null);
    expect(screen.queryByLabelText("Account menu")).toBeNull();
  });
});
