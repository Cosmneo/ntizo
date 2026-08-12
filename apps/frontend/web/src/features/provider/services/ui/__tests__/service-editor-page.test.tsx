import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import type { AvailabilityConfig } from "@/features/provider/availability/domain/types";
import type { ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";
import { ServiceEditorPage } from "../service-editor-page";
import type { ProviderService } from "../../domain/types";

/**
 * Renders the whole page rather than any one section in isolation: the
 * behaviours this suite exists to protect — which section shows first, when
 * the rail marks one done, what the disabled Publish says — are properties
 * of how the shell wires the rail, the sections and `completeness.ts`
 * together, not of any single section on its own.
 *
 * Every query this page reads is pre-seeded straight into the `QueryClient`
 * cache (`staleTime: Infinity` keeps that seed from being refetched away)
 * rather than mocked at the network layer — the same "seed the cache, never
 * touch the wire" approach `saveService`'s own tests use for the one call
 * this suite *does* need to observe (`sessionGraphql`, spied on to prove a
 * chip click never reaches the network).
 */

const PROVIDER: ProviderSummary = {
  id: "p1",
  name: "Bela Vista Studio",
  slug: "bela-vista",
  type: "organization",
  status: "active",
  role: "owner",
};

const INDIVIDUAL_PROVIDER: ProviderSummary = { ...PROVIDER, type: "individual" };

const ORG_AVAILABILITY: AvailabilityConfig = {
  providerId: PROVIDER.id,
  timezone: "Africa/Maputo",
  members: [
    { memberId: "m1", userId: "u1", name: "Ana", role: "owner", weekly: [], exceptions: [] },
    { memberId: "m2", userId: "u2", name: "Beto", role: "staff", weekly: [], exceptions: [] },
  ],
  closures: [],
};

const INDIVIDUAL_AVAILABILITY: AvailabilityConfig = {
  providerId: PROVIDER.id,
  timezone: "Africa/Maputo",
  members: [{ memberId: "m1", userId: "u1", name: "Ana", role: "owner", weekly: [], exceptions: [] }],
  closures: [],
};

const CURRENT_USER: CurrentUserDTO = {
  id: "u1",
  email: "ana@example.com",
  role: "organization_owner",
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

// The raw shape `category.all` resolves to — `useCategoryOptions` maps this
// itself, so the fixture stays in the wire's own vocabulary (`id`/`code`/`name`)
// rather than the mapped `SelectOption` one.
const CATEGORIES = [
  { id: "cat-1", code: "HAIR", name: "Haircut" },
  { id: "cat-2", code: "CLEAN", name: "Cleaning" },
];

/** A service already on the server, priced, with zero options yet — basics and performers complete, pricing not. */
const DRAFT_SERVICE_NEEDS_OPTION: ProviderService = {
  id: "svc-1",
  categoryId: "cat-1",
  categoryCode: "HAIR",
  sourceLocale: "en-US",
  locationType: "at_provider",
  bookingMode: "priced",
  status: "draft",
  imageUrls: [],
  translations: [{ locale: "en-US", name: "Haircut", description: null }],
  options: [],
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  memberIds: ["m1"],
};

function makeQueryClient() {
  // `staleTime: Infinity` keeps every seeded entry from being refetched the
  // moment a component mounts — without it, each query would immediately
  // fire its real `queryFn` against the (unmocked) network the instant this
  // page renders.
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function seed(
  qc: QueryClient,
  opts: {
    provider?: ProviderSummary;
    services?: ProviderService[];
    availability?: AvailabilityConfig;
  } = {},
) {
  const provider = opts.provider ?? PROVIDER;
  qc.setQueryData(["providers", "mine"], [provider]);
  qc.setQueryData(["provider", "services", provider.id], opts.services ?? []);
  qc.setQueryData(
    ["provider", "availability", provider.id],
    opts.availability ?? (provider.type === "individual" ? INDIVIDUAL_AVAILABILITY : ORG_AVAILABILITY),
  );
  qc.setQueryData(["user", "me"], CURRENT_USER);
  qc.setQueryData(["provider", "services", "categories", "en-US"], CATEGORIES);
}

function renderEditor(path: string, qc: QueryClient) {
  const rootRoute = createRootRoute();
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: "/provider/$slug" });
  const servicesListRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/services",
    component: () => <div>services list</div>,
  });
  const serviceEditorRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/services/$serviceId",
    component: ServiceEditorPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([servicesListRoute, serviceEditorRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ServiceEditorPage", () => {
  it("a new service starts on the essentials section", async () => {
    const qc = makeQueryClient();
    seed(qc);

    renderEditor("/provider/bela-vista/services/new", qc);

    // The essentials' own fields are on screen…
    expect(await screen.findByPlaceholderText("e.g. Haircut")).toBeInTheDocument();
    // …and the rail agrees: its own row for "The essentials" is the current step.
    const basicsRow = screen.getByRole("button", { name: /the essentials/i });
    expect(basicsRow).toHaveAttribute("aria-current", "step");
    // Nothing from a later section has rendered yet.
    expect(screen.queryByRole("radiogroup", { name: "How is it charged?" })).not.toBeInTheDocument();
  });

  it("the rail shows the essentials incomplete until a category is chosen", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderEditor("/provider/bela-vista/services/new", qc);

    // A name alone is not enough — `basicsCode` checks category first.
    await user.type(await screen.findByPlaceholderText("e.g. Haircut"), "Corte de cabelo");

    const basicsRow = screen.getByRole("button", { name: /the essentials/i });
    expect(within(basicsRow).getByText("To do")).toBeInTheDocument();
  });

  it("choosing a category marks the essentials done without a save", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql");

    renderEditor("/provider/bela-vista/services/new", qc);

    await user.type(await screen.findByPlaceholderText("e.g. Haircut"), "Corte de cabelo");
    await user.click(screen.getByRole("radio", { name: /haircut/i }));

    const basicsRow = screen.getByRole("button", { name: /the essentials/i });
    expect(within(basicsRow).getByText("Done")).toBeInTheDocument();
    // No mutation, and no other network call — the rail read this straight
    // off the draft in memory.
    expect(spy).not.toHaveBeenCalled();
  });

  it("publish is disabled while a required section is incomplete", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [DRAFT_SERVICE_NEEDS_OPTION] });

    renderEditor("/provider/bela-vista/services/svc-1", qc);

    const publish = await screen.findByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
  });

  it("the disabled publish names the missing thing, not a generic message", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [DRAFT_SERVICE_NEEDS_OPTION] });

    renderEditor("/provider/bela-vista/services/svc-1", qc);

    await screen.findByRole("button", { name: "Publish" });
    expect(
      screen.getByText("A priced service needs at least one option before it can be published."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong saving the service. Try again.")).not.toBeInTheDocument();
  });

  it("an individual provider sees no performers section in the rail", async () => {
    const qc = makeQueryClient();
    seed(qc, { provider: INDIVIDUAL_PROVIDER, availability: INDIVIDUAL_AVAILABILITY });

    renderEditor("/provider/bela-vista/services/new", qc);

    await screen.findByPlaceholderText("e.g. Haircut");
    expect(screen.queryByRole("button", { name: /who does it/i })).not.toBeInTheDocument();
  });

  it("an organization sees three required sections in the ring", async () => {
    const qc = makeQueryClient();
    seed(qc);

    renderEditor("/provider/bela-vista/services/new", qc);

    // Nothing filled in yet: zero of three required sections done.
    expect(
      await screen.findByRole("img", { name: "0 of 3 required sections done" }),
    ).toBeInTheDocument();
  });

  it("switching booking mode to quote replaces the options editor with the quote fields", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderEditor("/provider/bela-vista/services/new", qc);

    await user.click(await screen.findByRole("button", { name: /how it is charged/i }));

    expect(await screen.findByText("Save the service before adding options.")).toBeInTheDocument();
    expect(
      screen.queryByText("A quote service has no options — the price is only set after the request is seen."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "By quote" }));

    expect(screen.queryByText("Save the service before adding options.")).not.toBeInTheDocument();
    expect(
      screen.getByText("A quote service has no options — the price is only set after the request is seen."),
    ).toBeInTheDocument();
  });
});
