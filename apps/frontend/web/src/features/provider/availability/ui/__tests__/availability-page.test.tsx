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
import type { ProviderService } from "@/features/provider/services/domain/types";
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
  avatarKey: null,
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

/** A fetched weekly row — shape defaulted to "use the default" (`null`) unless a test needs otherwise. */
function rule(
  weekday: number,
  startMinute: number,
  endMinute: number,
  shape: { bufferMinutes?: number | null; slotIntervalMinutes?: number | null; capacity?: number | null } = {},
) {
  return {
    id: `r${weekday}`,
    weekday,
    startMinute,
    endMinute,
    bufferMinutes: shape.bufferMinutes ?? null,
    slotIntervalMinutes: shape.slotIntervalMinutes ?? null,
    capacity: shape.capacity ?? null,
  };
}

/**
 * A minimal published service, fixed or hourly. Only the fields the slot
 * preview actually reads are varied by the caller — the rest are filler a
 * real service always carries.
 */
function service(
  id: string,
  option:
    | { pricingMode: "fixed"; durationMinutes: number }
    | { pricingMode: "hourly"; minMinutes: number; stepMinutes: number },
): ProviderService {
  return {
    id,
    categoryId: "cat1",
    categoryCode: "cat1",
    sourceLocale: "en-US",
    locationType: "at_provider",
    bookingMode: "priced",
    status: "published",
    imageUrls: [],
  imageKeys: [],
    translations: [{ locale: "en-US", name: `Service ${id}`, description: null }],
    options: [
      {
        id: `${id}-o1`,
        pricingMode: option.pricingMode,
        amountMinor: 10000,
        currency: "MZN",
        durationMinutes: option.pricingMode === "fixed" ? option.durationMinutes : null,
        minMinutes: option.pricingMode === "hourly" ? option.minMinutes : null,
        stepMinutes: option.pricingMode === "hourly" ? option.stepMinutes : null,
        isDefault: true,
        isActive: true,
        sortOrder: 0,
        translations: [{ locale: "en-US", name: "Standard" }],
      },
    ],
    memberIds: ["m1"],
  };
}

function renderPage(availability: AvailabilityConfig, services: ProviderService[] = []) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["providers", "mine"], [PROVIDER]);
  qc.setQueryData(["provider", "availability", PROVIDER.id], availability);
  qc.setQueryData(["user", "me"], CURRENT_USER);
  // Seeded even when a test has none: an unseeded query would fire a real
  // `sessionGraphql` call the moment the preview's picker mounts, which is
  // exactly the stray network call every other query on this screen is
  // seeded to avoid.
  qc.setQueryData(["provider", "services", PROVIDER.id], services);

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

    // The card is on the left… scoped to it, because the block drawn in the
    // week now prints its span the same way, which is the point of the next
    // assertion rather than a collision to design around.
    expect(within(screen.getByRole("group")).getByText("09:00 – 17:00")).toBeInTheDocument();
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

    // …and so does the card that groups the two rows: Monday leads, Sunday
    // closes, which is display order and not the 0-for-Sunday storage order
    // asserted a few lines below.
    expect(screen.getByRole("group")).toHaveAccessibleName("Monday and Sunday, 09:00 – 17:00");

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

  // The regression this task exists for. `setWeeklyPattern` replaces a
  // member's whole week in one call, so every rule the provider does *not*
  // touch this session still travels with the save — and has to travel with
  // the shape it was actually given, not the shape a form field defaults to
  // when nobody seeded it. Before this fix, `toDraft` and `groupRules` both
  // dropped buffer/grid/capacity on the floor, so this test would have shown
  // Monday's drawer opening blank and Wednesday's saved capacity coming back
  // `null`.
  it("editing an unrelated rule resubmits every rule's own saved shape, not nulls", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({} as never);
    renderPage(
      config([
        // Monday 09:00–17:00, capped at 3 bookings.
        rule(1, 540, 1020, { capacity: 3 }),
        // Wednesday 08:00–12:00, deliberately offering no slots.
        rule(3, 480, 720, { slotIntervalMinutes: 0 }),
      ]),
    );
    await waitFor(() => expect(preview()).toBeInTheDocument());

    // Opening Monday's own card shows what was actually saved…
    await user.click(screen.getByRole("button", { name: "Edit 09:00 – 17:00" }));
    expect(screen.getByLabelText("Capacity")).toHaveValue("3");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // …and so does Wednesday's, on its own field.
    await user.click(screen.getByRole("button", { name: "Edit 08:00 – 12:00" }));
    expect(screen.getByRole("radio", { name: "No slots" })).toBeChecked();

    // Change only Wednesday's end time — its grid choice is left alone, not retyped.
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "13:00");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Save week" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const variables = spy.mock.calls[0]?.[1] as {
      input: {
        rules: { weekday: number; capacity: number | null; slotIntervalMinutes: number | null }[];
      };
    };
    const byWeekday = new Map(variables.input.rules.map((r) => [r.weekday, r]));
    // Monday was never opened this save — its capacity must still be 3, not null.
    expect(byWeekday.get(1)?.capacity).toBe(3);
    // Wednesday's hours changed, but its "no slots" choice survives the edit.
    expect(byWeekday.get(3)?.slotIntervalMinutes).toBe(0);
  });

  it("an individual provider is offered neither the person picker nor the team toggle", async () => {
    renderPage(config());

    await waitFor(() => expect(preview()).toBeInTheDocument());
    // One member means there is nobody to pick between, and the word "team"
    // has no reason to reach a solo provider's screen at all.
    expect(screen.queryByRole("radiogroup", { name: "Whose week" })).not.toBeInTheDocument();
    expect(screen.queryByText("Whole team")).not.toBeInTheDocument();
  });

  it("removing a card empties the week it drew", async () => {
    const user = userEvent.setup();
    renderPage(config([rule(1, 540, 1020)]));

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(within(preview()).getByText("09:00–17:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove 09:00 – 17:00" }));

    expect(within(preview()).queryByText("09:00–17:00")).not.toBeInTheDocument();
  });

  it("with no published service, says so and draws no slot marks", async () => {
    renderPage(config([rule(1, 540, 1020)]));

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(screen.getByText("Publish a service to preview its slots.")).toBeInTheDocument();
    expect(within(preview()).queryByTestId("slot-mark")).not.toBeInTheDocument();
  });

  it("defaults to the first published service and previews what its default option produces", async () => {
    const user = userEvent.setup();
    renderPage(config([rule(1, 540, 1020)]), [
      service("s1", { pricingMode: "fixed", durationMinutes: 60 }),
    ]);

    await waitFor(() => expect(preview()).toBeInTheDocument());
    // 09:00–17:00, a 60-minute option, no buffer, the default 30-minute grid:
    // a pick every 30 minutes through the last one that still fits — 15 of
    // them, confirmed against `startsForDay` directly before being written
    // down here, not derived from the UI under test.
    expect(screen.getByText("15 slots · 15 places")).toBeInTheDocument();
    // The count is stated whatever the drawing shows; the ladder itself is
    // opt-in, since ninety bars over a working week is what made the old grid
    // unreadable.
    await user.click(screen.getByRole("radio", { name: "Slots" }));
    expect(within(preview()).getAllByTestId("slot-mark")).toHaveLength(15);
  });

  it("previews an hourly service from its minimum and step, not a guessed fixed length", async () => {
    const user = userEvent.setup();
    renderPage(config([rule(1, 540, 1020)]), [
      service("s1", { pricingMode: "hourly", minMinutes: 60, stepMinutes: 30 }),
    ]);

    await waitFor(() => expect(preview()).toBeInTheDocument());
    // Same window, a 60-minute minimum with no buffer: the occupied span an
    // hourly start needs is its minimum, so this lands on the same 15 starts
    // as the fixed 60-minute case above — confirmed independently rather than
    // assumed from that coincidence.
    expect(screen.getByText("15 slots · 15 places")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Slots" }));
    expect(within(preview()).getAllByTestId("slot-mark")).toHaveLength(15);
  });

  it("switching the picker previews the newly chosen service", async () => {
    const user = userEvent.setup();
    renderPage(config([rule(1, 540, 1020)]), [
      service("s1", { pricingMode: "fixed", durationMinutes: 60 }),
      service("s2", { pricingMode: "fixed", durationMinutes: 480 }),
    ]);

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(screen.getByText("15 slots · 15 places")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Preview for"));
    await user.click(screen.getByRole("option", { name: "Service s2" }));

    // An 8-hour, 480-minute option in an 8-hour window fits exactly once.
    expect(screen.getByText("1 slots · 1 places")).toBeInTheDocument();
  });
});
