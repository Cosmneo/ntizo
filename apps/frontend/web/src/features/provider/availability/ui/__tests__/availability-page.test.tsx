import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import * as client from "@/shared/lib/graphql/session-graphql";
import type { ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";
import { AvailabilityPage } from "../availability-page";
import type { AvailabilityConfig } from "../../domain/types";

/**
 * The whole screen, because the behaviours worth protecting here are the wiring
 * between its two columns: a rule edited on the left changes the week drawn on
 * the right with nothing in between, and the Monday-first display never leaks
 * into the numbering that goes over the wire.
 *
 * Every query is seeded straight into the cache with `staleTime: Infinity`, the
 * same approach `service-editor-page.test.tsx` settled on — the only network
 * call any test here observes is the save, and that one is spied on directly.
 */

const PROVIDER: ProviderSummary = {
  id: "p1",
  name: "Bela Vista Studio",
  slug: "bela-vista",
  type: "individual",
  status: "active",
  role: "owner",
};

const CURRENT_USER: CurrentUserDTO = {
  id: "u1",
  email: "ana@example.com",
  role: "individual_provider",
  status: "active",
  createdAt: "2024-01-01T00:00:00.000Z",
  name: "Ana",
  firstName: "Ana",
  lastName: "M",
  displayName: "Ana",
  avatarUrl: null,
  phoneNumber: null,
  bio: null,
  language: "en-US",
  timezone: "Africa/Maputo",
  dateOfBirth: null,
  gender: null,
};

function config(weekly: AvailabilityConfig["members"][number]["weekly"] = []): AvailabilityConfig {
  return {
    providerId: PROVIDER.id,
    timezone: "Africa/Maputo",
    members: [{ memberId: "m1", userId: "u1", name: "Ana", role: "owner", weekly, exceptions: [] }],
    closures: [],
  };
}

function rule(weekday: number, startMinute: number, endMinute: number) {
  return { id: `r${weekday}`, weekday, startMinute, endMinute };
}

function renderPage(availability: AvailabilityConfig) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["providers", "mine"], [PROVIDER]);
  qc.setQueryData(["provider", "availability", PROVIDER.id], availability);
  qc.setQueryData(["user", "me"], CURRENT_USER);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: "/provider/$slug" });
  const availabilityRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/availability",
    component: AvailabilityPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([availabilityRoute])]),
    history: createMemoryHistory({ initialEntries: ["/provider/bela-vista/availability"] }),
  });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

/** The right-hand column — `WeekPreview`'s own labelled region. */
function preview() {
  return screen.getByRole("region", { name: "The week this produces" });
}

afterEach(() => vi.restoreAllMocks());

describe("AvailabilityPage", () => {
  it("a rule saved in the drawer appears in the preview without a reload", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql");
    renderPage(config());

    // The precondition, asserted rather than assumed: an empty week draws no
    // hours at all. Without this the assertion below could pass against a
    // preview that had been showing 09:00–17:00 from the start.
    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(within(preview()).queryByText("09:00–17:00")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add hours" }));
    await user.click(screen.getByRole("checkbox", { name: "Monday" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    // The card is on the left…
    expect(screen.getByText("09:00 – 17:00")).toBeInTheDocument();
    // …and the week on the right already agrees, with nothing sent anywhere.
    expect(within(preview()).getByText("09:00–17:00")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("the week is displayed Monday first while the stored weekday stays 0 for Sunday", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({} as never);
    renderPage(config([rule(0, 540, 1020), rule(1, 540, 1020)]));

    // The preview's own columns run Monday to Sunday…
    await waitFor(() => expect(preview()).toBeInTheDocument());
    const headers = within(preview()).getAllByText(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/,
    );
    expect(headers.map((h) => h.textContent)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);

    // …and so does the card that groups the two rows.
    const card = screen.getByRole("group");
    const chips = within(card).getAllByText(/^(Mon|Sun)$/);
    expect(chips.map((c) => c.textContent)).toEqual(["Mon", "Sun"]);

    // What goes over the wire is the storage numbering, untouched: Sunday is 0.
    //
    // The week has to actually differ from the fetched one before there is
    // anything to save — the save bar only exists when there are unsaved
    // changes, so a save of untouched data is no longer reachable, which is
    // the pointless round trip that was the point of removing it. Both rows
    // share one card, so editing its end time keeps the weekdays this test is
    // about exactly as they were.
    await user.click(screen.getByRole("button", { name: "Edit 09:00 – 17:00" }));
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "18:00");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Save week" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const variables = spy.mock.calls[0]?.[1] as { input: { rules: { weekday: number }[] } };
    expect(variables.input.rules.map((r) => r.weekday)).toEqual([1, 0]);
  });

  it("a rule added after another is still sent in the week's own order", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({} as never);
    renderPage(config([rule(3, 840, 1080)]));

    // Wednesday afternoon is already there; Monday morning is typed second.
    await user.click(await screen.findByRole("button", { name: "Add hours" }));
    await user.click(screen.getByRole("checkbox", { name: "Monday" }));
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "13:00");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Save week" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const variables = spy.mock.calls[0]?.[1] as { input: { rules: { weekday: number }[] } };
    // Typing order is not week order — what leaves the browser is the week.
    expect(variables.input.rules.map((r) => r.weekday)).toEqual([1, 3]);
  });

  it("an individual provider is offered neither the person picker nor the team toggle", async () => {
    renderPage(config());

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(screen.queryByRole("radiogroup", { name: "Show" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Person")).not.toBeInTheDocument();
  });

  it("removing a card empties the week it drew", async () => {
    const user = userEvent.setup();
    renderPage(config([rule(1, 540, 1020)]));

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(within(preview()).getByText("09:00–17:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove 09:00 – 17:00" }));

    expect(within(preview()).queryByText("09:00–17:00")).not.toBeInTheDocument();
  });
});
